const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');

const DEFAULT_EXPIRY_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;


// =====================================================
// GET TOTAL AVAILABLE STOCK PER PRODUCT
// =====================================================
// We use remainingQuantity because this is the actual
// stock currently available.
//
// quantity = original quantity received
// remainingQuantity = quantity still available
//
const getStockTotals = async () => {
  const now = new Date();

  return StockBatch.aggregate([
    {
      $match: {
        remainingQuantity: { $gt: 0 },

        // Expired stock should not count as sellable stock
        $or: [
          { expiryDate: null },
          { expiryDate: { $gt: now } }
        ]
      }
    },

    {
      $group: {
        _id: '$product',
        totalQty: { $sum: '$remainingQuantity' }
      }
    }
  ]);
};


// =====================================================
// BUILD LOW STOCK ALERTS
// =====================================================
const buildLowStock = async () => {
  const totals = await getStockTotals();

  const totalMap = new Map(
    totals.map((t) => [
      String(t._id),
      t.totalQty
    ])
  );

  const products = await Product.find({
    isActive: { $ne: false }
  })
    .select('name category unit reorderLevel barcode')
    .lean();

  const lowStockProducts = products
    .map((p) => {
      const currentStock =
        totalMap.get(String(p._id)) || 0;

      return {
        p,
        currentStock
      };
    }).filter(({ p, currentStock }) => {
      return currentStock <= (p.reorderLevel ?? 0);
    });
  const lowProductIds = lowStockProducts.map(({ p }) => p._id);
  const relevantBatches = lowProductIds.length ? await StockBatch.find({
    product: { $in: lowProductIds },
    remainingQuantity: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
  }).select('product batchNumber remainingQuantity expiryDate').lean() : [];
  const batchesByProduct = new Map();
  relevantBatches.forEach((batch) => {
    const key = String(batch.product);
    batchesByProduct.set(key, [...(batchesByProduct.get(key) || []), {
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      remainingQuantity: batch.remainingQuantity,
      expiryDate: batch.expiryDate,
    }]);
  });

  return lowStockProducts.map(({ p, currentStock }) => ({
      type: 'LOW_STOCK',

      severity:
        currentStock === 0
          ? 'critical'
          : 'warning',

      productId: p._id,
      name: p.name,
      category: p.category,
      unit: p.unit,

      currentStock,
      batches: batchesByProduct.get(String(p._id)) || [],

      reorderLevel: p.reorderLevel,

      suggestedReorderQty: Math.max(
        (Number(p.reorderLevel) || 0) * 2 - currentStock,
        1
      ),

      message:
        currentStock === 0
          ? `${p.name} is out of stock`
          : `${p.name} is low: ${currentStock} ${p.unit || ''} left (reorder level ${p.reorderLevel})`
    }))

    .sort(
      (a, b) => a.currentStock - b.currentStock
    );
};


// =====================================================
// BUILD EXPIRY ALERTS
// =====================================================
const buildExpiry = async (days = DEFAULT_EXPIRY_DAYS) => {
  const now = new Date();

  // Find only batches that still have stock.
  // Depleted batches do not need expiry alerts.
  const batches = await StockBatch.find({
    remainingQuantity: { $gt: 0 },

    expiryDate: { $ne: null }
  })
    .populate(
      'product',
      'name unit category expiryAlertDays'
    )
    .sort({
      expiryDate: 1
    })
    .lean();

  return batches

    // Ignore batches whose product no longer exists
    .filter((b) => b.product)

    .map((b) => {
      const msLeft =
        new Date(b.expiryDate) - now;

      const daysLeft =
        Math.ceil(msLeft / MS_PER_DAY);

      // Product-specific expiry alert window.
      // If product does not have one, use the
      // requested/default number of days.
      const alertDays =
        b.product.expiryAlertDays ?? days;

      return {
        b,
        daysLeft,
        alertDays
      };
    })

    // Include:
    // - already expired batches
    // - batches expiring within alert window
    .filter(({ daysLeft, alertDays }) => {
      return daysLeft <= alertDays;
    })

    .map(({ b, daysLeft, alertDays }) => {
     const expired = new Date(b.expiryDate) < now;
      // const expired = daysLeft < 0;

      // Last 25% of the alert window is critical.
      const criticalDays = Math.max(
        Math.floor(alertDays * 0.25),
        1
      );

      const severity =
        expired || daysLeft <= criticalDays
          ? 'critical'
          : 'warning';

      return {
        type: expired
          ? 'EXPIRED'
          : 'EXPIRING_SOON',

        severity,

        batchId: b._id,

        batchNumber: b.batchNumber,

        productId: b.product._id,

        name: b.product.name,

        unit: b.product.unit,

        // IMPORTANT:
        // Show remaining stock, not original quantity.
        quantity: b.remainingQuantity,

        expiryDate: b.expiryDate,

        daysLeft,

        alertWindowDays: alertDays,

        message: expired
          ? `${b.product.name} batch expired ${Math.abs(daysLeft)} day(s) ago (${b.remainingQuantity} left)`
          : `${b.product.name} batch expires in ${daysLeft} day(s) (${b.remainingQuantity} left)`
      };
    });
};


// =====================================================
// GET ALL ALERTS
// GET /api/alerts?days=30
// =====================================================
exports.getAlerts = async (req, res) => {
  try {
    const days = Math.max(
      parseInt(req.query.days) || DEFAULT_EXPIRY_DAYS,
      1
    );

    const [lowStock, expiry] =
      await Promise.all([
        buildLowStock(),
        buildExpiry(days)
      ]);

    const all = [
      ...lowStock,
      ...expiry
    ];

    const summary = {
      total: all.length,

      critical: all.filter(
        (a) => a.severity === 'critical'
      ).length,

      lowStock: lowStock.length,

      outOfStock: lowStock.filter(
        (a) => a.currentStock === 0
      ).length,

      expiringSoon: expiry.filter(
        (a) => a.type === 'EXPIRING_SOON'
      ).length,

      expired: expiry.filter(
        (a) => a.type === 'EXPIRED'
      ).length
    };

    res.json({
      success: true,
      summary,
      lowStock,
      expiry
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


// =====================================================
// GET LOW STOCK ALERTS
// GET /api/alerts/low-stock
// =====================================================
exports.getLowStockAlerts = async (req, res) => {
  try {
    const lowStock =
      await buildLowStock();

    res.json({
      success: true,
      count: lowStock.length,
      data: lowStock
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


// =====================================================
// GET EXPIRY ALERTS
// GET /api/alerts/expiry?days=30
// =====================================================
exports.getExpiryAlerts = async (req, res) => {
  try {
    const days = Math.max(
      parseInt(req.query.days) || DEFAULT_EXPIRY_DAYS,
      1
    );

    const expiry =
      await buildExpiry(days);

    res.json({
      success: true,
      count: expiry.length,
      data: expiry
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


// =====================================================
// GET ALERT COUNT
// GET /api/alerts/count
// =====================================================
exports.getAlertCount = async (req, res) => {
  try {
    const [lowStock, expiry] =
      await Promise.all([
        buildLowStock(),
        buildExpiry(DEFAULT_EXPIRY_DAYS)
      ]);

    res.json({
      success: true,
      count:
        lowStock.length +
        expiry.length
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
