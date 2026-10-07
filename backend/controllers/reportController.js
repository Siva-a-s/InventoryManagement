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

  return rows.map((r) => ({
    label: r._id,
    sales: round(r.sales),
    bills: r.bills,
    itemsSold: r.itemsSold,
    avgBillValue: r.bills
      ? round(r.sales / r.bills)
      : 0,
  }));
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

    {
      $sort: {
        [sortField]: direction,
      },
    },

    {
      $limit: limit,
    },
  ]);

  return rows.map((r) => ({
    product: r._id,
    name: r.name,
    unitsSold: r.unitsSold,
    revenue: round(r.revenue),
  }));
}

async function getFastMovingProducts(
  from,
  to,
  limit
) {
  const soldRows = await Bill.aggregate([
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

        unitsSold: {
          $sum: '$items.quantity',
        },

        name: {
          $first: '$items.name',
        },
      },
    },
  ]);

  const receivedRows = await StockBatch.aggregate([
    {
      $match: {
        purchaseDate: {
          $gte: from,
          $lte: to,
        },
      },
    },

    {
      $group: {
        _id: '$product',

        unitsReceived: {
          $sum: '$quantity',
        },
      },
    },
  ]);

  const receivedMap = new Map(
    receivedRows.map((row) => [
      row._id.toString(),
      row.unitsReceived,
    ])
  );

  const rows = soldRows
    .map((row) => {
      const unitsReceived =
        receivedMap.get(row._id.toString()) || 0;

      const sellThrough =
        unitsReceived > 0
          ? (row.unitsSold / unitsReceived) * 100
          : 0;

      return {
        product: row._id,
        name: row.name,
        unitsSold: row.unitsSold,
        unitsReceived,
        sellThrough: round(sellThrough),
      };
    })
    .filter((row) => row.unitsReceived > 0)
    .sort(
      (a, b) =>
        b.sellThrough - a.sellThrough
    )
    .slice(0, limit);

  return rows;
}

async function getPurchaseAnalysis(from, to) {
  const rows = await PurchaseOrder.aggregate([
    {
      $match: {
        createdAt: {
          $gte: from,
          $lte: to,
        },
      },
    },

    {
      $group: {
        _id: null,

        purchaseValue: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'received'] },
              '$totalAmount',
              0,
            ],
          },
        },

        receivedPOs: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'received'] },
              1,
              0,
            ],
          },
        },

        pendingPOs: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'pending'] },
              1,
              0,
            ],
          },
        },

        cancelledPOs: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'cancelled'] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    purchaseValue: round(rows[0]?.purchaseValue || 0),
    receivedPOs: rows[0]?.receivedPOs || 0,
    pendingPOs: rows[0]?.pendingPOs || 0,
    cancelledPOs: rows[0]?.cancelledPOs || 0,
  };
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
    count: 0,
  };

  const w = wastageRows[0] || {
    loss: 0,
    units: 0,
  };

  return {
    grossSales: round(s.sales),

    billCount: s.bills,

    itemsSold: s.itemsSold,

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
        createdAt: {
          $gte: from,
          $lte: to,
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
      for (const batch of item.batches || []) {
        const stockBatch =
          await StockBatch.findById(batch.batch)
            .select('costPrice')
            .lean();

        if (stockBatch) {
          cogs +=
            batch.quantity *
            (stockBatch.costPrice || 0);
        }
      }
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

exports.getFastMovingProducts = async (req, res) => {
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

    const data = await getFastMovingProducts(
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

    const data = rows.map((r) => ({
      category: r._id,
      unitsSold: r.unitsSold,
      revenue: round(r.revenue),
    }));

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