const Bill = require('../models/Bill');
const Product = require('../models/Product');
const Return = require('../models/Return');
const Wastage = require('../models/Wastage');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/Purchaseorder');

const TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;


// --------------------------------------------------
// DATE HELPERS
// --------------------------------------------------

function startOfToday() {
  const t = new Date(Date.now() + IST_OFFSET);

  t.setUTCHours(0, 0, 0, 0);

  return new Date(t.getTime() - IST_OFFSET);
}

function startOfWeek() {
  const today = startOfToday();

  const localDate = new Date(Date.now() + IST_OFFSET);
  const dayNumber = localDate.getUTCDay(); // 0 = Sunday

  const daysSinceMonday = (dayNumber + 6) % 7;

  return new Date(
    today.getTime() - daysSinceMonday * ONE_DAY
  );
}

function startOfMonth() {
  const t = new Date(Date.now() + IST_OFFSET);

  return new Date(
    Date.UTC(
      t.getUTCFullYear(),
      t.getUTCMonth(),
      1
    ) - IST_OFFSET
  );
}


// reads:
// ?from=2026-10-01&to=2026-10-31
//
// default = last 30 days
function getDateRange(query) {
  const to = query.to
    ? new Date(query.to + 'T23:59:59.999+05:30')
    : new Date();

  const from = query.from
    ? new Date(query.from + 'T00:00:00+05:30')
    : new Date(
        startOfToday().getTime() - 29 * ONE_DAY
      );

  if (
    isNaN(from.getTime()) ||
    isNaN(to.getTime()) ||
    from > to
  ) {
    return null;
  }

  return {
    from,
    to,
  };
}


// --------------------------------------------------
// SALES TREND
// --------------------------------------------------

async function getSalesTrend(from, to, period) {
  const formats = {
    daily: '%Y-%m-%d',
    weekly: '%G-W%V',
    monthly: '%Y-%m',
  };

  const rows = await Bill.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: {
          $gte: from,
          $lte: to,
        },
      },
    },

    {
      $group: {
        _id: {
          $dateToString: {
            format: formats[period],
            date: '$createdAt',
            timezone: TIMEZONE,
          },
        },

        // Bill.total is the actual amount charged.
        sales: {
          $sum: '$total',
        },

        bills: {
          $sum: 1,
        },

        itemsSold: {
          $sum: {
            $sum: '$items.quantity',
          },
        },
      },
    },

    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  const byLabel = new Map(rows.map((row) => [row._id, { sales: row.sales, bills: row.bills, itemsSold: row.itemsSold }]));
  const returnedRows = await Return.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $lookup: { from: Bill.collection.name, localField: 'bill', foreignField: '_id', as: 'billInfo' } },
    { $unwind: '$billInfo' },
    { $match: { 'billInfo.status': 'completed' } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { $dateToString: { format: formats[period], date: '$createdAt', timezone: TIMEZONE } },
        refunds: { $sum: '$items.refundAmount' },
        units: { $sum: '$items.quantity' },
      },
    },
  ]);
  for (const returned of returnedRows) {
    const row = byLabel.get(returned._id) || { sales: 0, bills: 0, itemsSold: 0 };
    row.sales -= returned.refunds || 0;
    row.itemsSold -= returned.units || 0;
    byLabel.set(returned._id, row);
  }

  return Array.from(byLabel, ([label, row]) => ({
    label,
    sales: round(row.sales),
    bills: row.bills,
    itemsSold: Math.max(0, row.itemsSold),
    avgBillValue: row.bills ? round(row.sales / row.bills) : 0,
  })).sort((a, b) => a.label.localeCompare(b.label));
}


// --------------------------------------------------
// TOP / SLOWEST PRODUCTS
// --------------------------------------------------

async function getTopProducts(
  from,
  to,
  limit,
  sortBy,
  order
) {
  const sortField =
    sortBy === 'revenue'
      ? 'revenue'
      : 'unitsSold';

  const direction =
    order === 'asc'
      ? 1
      : -1;

  const rows = await Bill.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: {
          $gte: from,
          $lte: to,
        },
      },
    },

    {
      $unwind: '$items',
    },

    {
      $group: {
        _id: '$items.product',

        name: {
          $first: '$items.name',
        },

        unitsSold: {
          $sum: '$items.quantity',
        },

        // IMPORTANT:
        // Use lineTotal instead of quantity × price
        // because lineTotal already includes discount.
        revenue: {
          $sum: '$items.lineTotal',
        },
      },
    },

  ]);

  const products = new Map(rows.map((row) => [String(row._id), {
    product: row._id,
    name: row.name,
    unitsSold: row.unitsSold,
    revenue: row.revenue,
  }]));
  const returns = await getCompletedReturns(from, to);
  for (const record of returns) {
    if (record.bill?.status !== 'completed') continue;
    for (const item of record.items) {
      const id = String(item.product);
      const row = products.get(id) || { product: item.product, name: item.name || 'Product', unitsSold: 0, revenue: 0 };
      row.unitsSold -= Number(item.quantity) || 0;
      row.revenue -= Number(item.refundAmount) || 0;
      products.set(id, row);
    }
  }
  return Array.from(products.values())
    .sort((a, b) => direction * (a[sortField] - b[sortField]))
    .slice(0, limit)
    .map((row) => ({ ...row, unitsSold: Math.max(0, row.unitsSold), revenue: round(row.revenue) }));
}

async function getPurchaseAnalysis(from, to) {
  const [receivedRows, statusRows] = await Promise.all([
    PurchaseOrder.aggregate([
      {
        $match: {
          status: 'received',
          $expr: {
            $and: [
              { $gte: [{ $ifNull: ['$receivedAt', '$createdAt'] }, from] },
              { $lte: [{ $ifNull: ['$receivedAt', '$createdAt'] }, to] },
            ],
          },
        },
      },
      { $group: { _id: null, purchaseValue: { $sum: '$totalAmount' }, receivedPOs: { $sum: 1 } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ['pending', 'cancelled'] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const counts = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));

  return {
    purchaseValue: round(receivedRows[0]?.purchaseValue || 0),
    receivedPOs: receivedRows[0]?.receivedPOs || 0,
    pendingPOs: counts.pending || 0,
    cancelledPOs: counts.cancelled || 0,
  };
}

/*
 * Historical bill allocations carry their sale-time cost. The current batch
 * cost is consulted only for bills written before that field was stored.
 */
async function getHistoricalAllocationCost(allocation) {
  if (Number.isFinite(allocation.costPrice)) return allocation.costPrice;
  const batch = await StockBatch.findById(allocation.batch).select('costPrice').lean();
  return Number(batch?.costPrice) || 0;
}

async function getBillItemCogs(item) {
  let total = 0;
  for (const allocation of item.batches || []) {
    total += Number(allocation.quantity) * await getHistoricalAllocationCost(allocation);
  }
  return total;
}

async function getCompletedReturns(from, to) {
  return Return.find({ createdAt: { $gte: from, $lte: to } })
    .populate({ path: 'bill', select: 'status items' })
    .lean();
}

async function getRestockedReturnCogs(returnRecord, returnItem) {
  if (!returnItem.restocked || !returnItem.restockedBatch || !returnRecord.bill) return 0;
  const billItem = returnRecord.bill.items.find((item) =>
    String(item.product) === String(returnItem.product)
  );
  const allocation = billItem?.batches?.find((entry) =>
    String(entry.batch) === String(returnItem.restockedBatch)
  );
  if (!allocation) return 0;
  return Number(returnItem.quantity) * await getHistoricalAllocationCost(allocation);
}

// --------------------------------------------------
// SUMMARY
// --------------------------------------------------

async function getSummary(from, to) {
  const range = {
    $gte: from,
    $lte: to,
  };

  // ---------- SALES ----------
  const salesRows = await Bill.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: range,
      },
    },

    {
      $group: {
        _id: null,

        sales: {
          $sum: '$total',
        },

        bills: {
          $sum: 1,
        },

        itemsSold: {
          $sum: {
            $sum: '$items.quantity',
          },
        },
      },
    },
  ]);

  // ---------- REFUNDS ----------
  const refundRows = await Return.aggregate([
    {
      $match: {
        createdAt: range,
      },
    },

    {
      $lookup: {
        from: Bill.collection.name,
        localField: 'bill',
        foreignField: '_id',
        as: 'billInfo',
      },
    },

    {
      $unwind: '$billInfo',
    },

    // A return belonging to a cancelled bill
    // should not affect normal sales reporting.
    {
      $match: {
        'billInfo.status': 'completed',
      },
    },

    {
      $group: {
        _id: null,

        refunds: {
          $sum: '$totalRefund',
        },

        unitsReturned: {
          $sum: { $sum: '$items.quantity' },
        },

        count: {
          $sum: 1,
        },
      },
    },
  ]);

  // ---------- WASTAGE ----------
  const wastageRows = await Wastage.aggregate([
    {
      $match: {
        createdAt: range,
      },
    },

    {
      $group: {
        _id: null,

        loss: {
          $sum: '$totalCost',
        },

        units: {
          $sum: '$quantity',
        },
      },
    },
  ]);

  const s = salesRows[0] || {
    sales: 0,
    bills: 0,
    itemsSold: 0,
  };

  const r = refundRows[0] || {
    refunds: 0,
    unitsReturned: 0,
    count: 0,
  };

  const w = wastageRows[0] || {
    loss: 0,
    units: 0,
  };

  return {
    grossSales: round(s.sales),

    billCount: s.bills,

    itemsSold: Math.max(0, s.itemsSold - r.unitsReturned),

    avgBillValue: s.bills
      ? round(s.sales / s.bills)
      : 0,

    refunds: round(r.refunds),

    refundCount: r.count,

    netRevenue: round(
      s.sales - r.refunds
    ),

    wastageLoss: round(w.loss),

    wastedUnits: w.units,
  };
}
async function getSupplierPurchaseAnalysis(from, to, limit) {
  const rows = await PurchaseOrder.aggregate([
    {
      $match: {
        status: 'received',
        $expr: {
          $and: [
            { $gte: [{ $ifNull: ['$receivedAt', '$createdAt'] }, from] },
            { $lte: [{ $ifNull: ['$receivedAt', '$createdAt'] }, to] },
          ],
        },
      },
    },

    {
      $group: {
        _id: '$supplier',

        purchaseValue: {
          $sum: '$totalAmount',
        },

        purchaseOrders: {
          $sum: 1,
        },

        itemsPurchased: {
          $sum: {
            $sum: '$items.quantity',
          },
        },
      },
    },

    {
      $lookup: {
        from: 'suppliers',
        localField: '_id',
        foreignField: '_id',
        as: 'supplier',
      },
    },

    {
      $unwind: {
        path: '$supplier',
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $sort: {
        purchaseValue: -1,
      },
    },

    {
      $limit: limit,
    },
  ]);

  return rows.map((row) => ({
    supplier: row._id,
    name: row.supplier?.name || 'Unknown Supplier',
    purchaseValue: round(row.purchaseValue),
    purchaseOrders: row.purchaseOrders,
    itemsPurchased: row.itemsPurchased,
  }));
}


async function getProfitability(from, to) {
  const bills = await Bill.find({
    status: 'completed',
    createdAt: {
      $gte: from,
      $lte: to,
    },
  })
    .select('items')
    .lean();

  let cogs = 0;

  for (const bill of bills) {
    for (const item of bill.items) {
      cogs += await getBillItemCogs(item);
    }
  }

  const returns = await getCompletedReturns(from, to);
  for (const returnRecord of returns) {
    if (returnRecord.bill?.status !== 'completed') continue;
    for (const item of returnRecord.items) {
      cogs -= await getRestockedReturnCogs(returnRecord, item);
    }
  }

  const summary = await getSummary(from, to);

  const netRevenue = summary.netRevenue || 0;

  const grossProfit =
    netRevenue - cogs;

  const grossMargin =
    netRevenue > 0
      ? (grossProfit / netRevenue) * 100
      : 0;

  return {
    netRevenue: round(netRevenue),
    cogs: round(cogs),
    grossProfit: round(grossProfit),
    grossMargin: round(grossMargin),
  };
}



async function getProductProfitability(
  from,
  to,
  limit
) {
  const bills = await Bill.find({
    status: 'completed',
    createdAt: {
      $gte: from,
      $lte: to,
    },
  })
    .select('items')
    .lean();

  const productMap = new Map();

  for (const bill of bills) {
    for (const item of bill.items) {
      const revenue = item.lineTotal || 0;
      const cogs = await getBillItemCogs(item);

      const productId = item.product.toString();

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product: item.product,
          name: item.name,
          unitsSold: 0,
          revenue: 0,
          cogs: 0,
        });
      }

      const product =
        productMap.get(productId);

      product.unitsSold += item.quantity;
      product.revenue += revenue;
      product.cogs += cogs;
    }
  }

  const returns = await getCompletedReturns(from, to);
  for (const returnRecord of returns) {
    if (returnRecord.bill?.status !== 'completed') continue;
    for (const item of returnRecord.items) {
      const productId = String(item.product);
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product: item.product,
          name: item.name || 'Product',
          unitsSold: 0,
          revenue: 0,
          cogs: 0,
        });
      }
      const product = productMap.get(productId);
      product.unitsSold -= Number(item.quantity) || 0;
      product.revenue -= Number(item.refundAmount) || 0;
      product.cogs -= await getRestockedReturnCogs(returnRecord, item);
    }
  }

  const rows = Array.from(productMap.values());

  return rows
    .map((row) => {
      const grossProfit =
        row.revenue - row.cogs;

      const grossMargin =
        row.revenue > 0
          ? (grossProfit / row.revenue) * 100
          : 0;

      return {
        product: row.product,
        name: row.name,
        unitsSold: row.unitsSold,
        revenue: round(row.revenue),
        cogs: round(row.cogs),
        grossProfit: round(grossProfit),
        grossMargin: round(grossMargin),
      };
    })
    .sort((a, b) =>
      b.grossProfit - a.grossProfit
    )
    .slice(0, limit);
}


async function getInventoryHealth() {
  const batches = await StockBatch.find({
    remainingQuantity: { $gt: 0 },
  })
    .populate('product', 'name reorderLevel expiryAlertDays')
    .lean();

  let inventoryValue = 0;
  let totalUnits = 0;
  let expiredUnits = 0;
  let nearExpiryUnits = 0;

  const lowStockProducts = new Set();

  const now = new Date();

  for (const batch of batches) {
    const quantity = batch.remainingQuantity || 0;
    const cost = batch.costPrice || 0;

    if (
      batch.expiryDate &&
      new Date(batch.expiryDate) < now
    ) {
      expiredUnits += quantity;
      continue;
    }

    inventoryValue += quantity * cost;
    totalUnits += quantity;

    if (batch.expiryDate && batch.product?.expiryAlertDays) {
      const alertDate = new Date();
      alertDate.setDate(
        alertDate.getDate() +
        batch.product.expiryAlertDays
      );

      if (
        new Date(batch.expiryDate) <= alertDate
      ) {
        nearExpiryUnits += quantity;
      }
    }
  }

  const products = await Product.find({
    isActive: { $ne: false },
  })
    .select('name reorderLevel')
    .lean();

  for (const product of products) {
    const stock = batches
      .filter(
        (batch) =>
          batch.product?._id?.toString() ===
          product._id.toString() &&
          (!batch.expiryDate || new Date(batch.expiryDate) >= now)
      )
      .reduce(
        (total, batch) =>
          total + (batch.remainingQuantity || 0),
        0
      );

    if (stock <= (product.reorderLevel || 0)) {
      lowStockProducts.add(
        product._id.toString()
      );
    }
  }

  return {
    inventoryValue: round(inventoryValue),
    totalUnits: round(totalUnits),
    lowStockProducts: lowStockProducts.size,
    expiredUnits: round(expiredUnits),
    nearExpiryUnits: round(nearExpiryUnits),
  };
}
// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

// GET /api/reports/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();

    const today = await getSummary(
      startOfToday(),
      now
    );

    const week = await getSummary(
      startOfWeek(),
      now
    );

    const month = await getSummary(
      startOfMonth(),
      now
    );

    const sevenDaysAgo = new Date(
      startOfToday().getTime() - 6 * ONE_DAY
    );

    const last7Days = await getSalesTrend(
      sevenDaysAgo,
      now,
      'daily'
    );

    const topProductsThisMonth =
      await getTopProducts(
        startOfMonth(),
        now,
        5,
        'units',
        'desc'
      );

    res.json({
      today,
      week,
      month,
      last7Days,
      topProductsThisMonth,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// --------------------------------------------------
// SALES CHART
// --------------------------------------------------

// GET /api/reports/sales
exports.getSalesTrend = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const period =
      req.query.period || 'daily';

    if (
      !['daily', 'weekly', 'monthly'].includes(
        period
      )
    ) {
      return res.status(400).json({
        message:
          'period must be daily, weekly or monthly',
      });
    }

    const data = await getSalesTrend(
      range.from,
      range.to,
      period
    );

    res.json({
      period,
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// --------------------------------------------------
// TOP / SLOWEST PRODUCTS
// --------------------------------------------------

// GET /api/reports/top-products
exports.getTopProducts = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const requestedLimit =
      parseInt(req.query.limit) || 10;

    const limit = Math.min(
      Math.max(requestedLimit, 1),
      50
    );

    const sortBy =
      req.query.sortBy || 'units';

    if (!['units', 'revenue'].includes(sortBy)) {
      return res.status(400).json({
        message:
          'sortBy must be units or revenue',
      });
    }

    const order =
      req.query.order || 'desc';

    if (!['asc', 'desc'].includes(order)) {
      return res.status(400).json({
        message:
          'order must be asc or desc',
      });
    }

    const data = await getTopProducts(
      range.from,
      range.to,
      limit,
      sortBy,
      order
    );

    res.json({
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

// --------------------------------------------------
// REVENUE SUMMARY
// --------------------------------------------------

// GET /api/reports/revenue-summary
exports.getRevenueSummary = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const length =
      range.to.getTime() -
      range.from.getTime();

    const previousTo = new Date(
      range.from.getTime() - 1
    );

    const previousFrom = new Date(
      previousTo.getTime() - length
    );

    const current = await getSummary(
      range.from,
      range.to
    );

    const previous = await getSummary(
      previousFrom,
      previousTo
    );

    let growthPercent = null;

    if (previous.netRevenue > 0) {
      growthPercent = round(
        (
          (current.netRevenue -
            previous.netRevenue) /
          previous.netRevenue
        ) * 100
      );
    }

    res.json({
      from: range.from,
      to: range.to,
      current,
      previous,
      netRevenueGrowthPercent:
        growthPercent,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// --------------------------------------------------
// SALES BY CATEGORY
// --------------------------------------------------

// GET /api/reports/sales-by-category
exports.getSalesByCategory = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const rows = await Bill.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: {
            $gte: range.from,
            $lte: range.to,
          },
        },
      },

      {
        $unwind: '$items',
      },

      {
        $lookup: {
          from: Product.collection.name,
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },

      {
        $unwind: {
          path: '$productInfo',
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $group: {
          _id: {
            $ifNull: [
              '$productInfo.category',
              'Uncategorized',
            ],
          },

          unitsSold: {
            $sum: '$items.quantity',
          },

          // Use actual lineTotal after discount.
          revenue: {
            $sum: '$items.lineTotal',
          },
        },
      },

      {
        $sort: {
          revenue: -1,
        },
      },
    ]);

    const byCategory = new Map(rows.map((row) => [String(row._id), {
      category: row._id,
      unitsSold: row.unitsSold,
      revenue: row.revenue,
    }]));
    const returnedRows = await Return.aggregate([
      { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
      { $lookup: { from: Bill.collection.name, localField: 'bill', foreignField: '_id', as: 'billInfo' } },
      { $unwind: '$billInfo' },
      { $match: { 'billInfo.status': 'completed' } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$productInfo.category', 'Uncategorized'] },
          unitsReturned: { $sum: '$items.quantity' },
          refunds: { $sum: '$items.refundAmount' },
        },
      },
    ]);
    for (const row of returnedRows) {
      const id = String(row._id);
      const category = byCategory.get(id) || { category: row._id, unitsSold: 0, revenue: 0 };
      category.unitsSold -= row.unitsReturned;
      category.revenue -= row.refunds;
      byCategory.set(id, category);
    }

    const data = Array.from(byCategory.values())
      .map((row) => ({
        category: row.category,
        unitsSold: Math.max(0, row.unitsSold),
        revenue: round(row.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
exports.getPurchaseAnalysis = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const data = await getPurchaseAnalysis(
      range.from,
      range.to
    );

    res.json({
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
exports.getSupplierPurchaseAnalysis = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const requestedLimit =
      parseInt(req.query.limit) || 10;

    const limit = Math.min(
      Math.max(requestedLimit, 1),
      50
    );

    const data =
      await getSupplierPurchaseAnalysis(
        range.from,
        range.to,
        limit
      );

    res.json({
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.getProfitability = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const data = await getProfitability(
      range.from,
      range.to
    );

    res.json({
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
exports.getProductProfitability = async (
  req,
  res
) => {
  try {
    const range = getDateRange(req.query);

    if (!range) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    const requestedLimit =
      parseInt(req.query.limit) || 10;

    const limit = Math.min(
      Math.max(requestedLimit, 1),
      50
    );

    const data =
      await getProductProfitability(
        range.from,
        range.to,
        limit
      );

    res.json({
      from: range.from,
      to: range.to,
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
exports.getInventoryHealth = async (req, res) => {
  try {
    const data = await getInventoryHealth();

    res.json({
      data,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
