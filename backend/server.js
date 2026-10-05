require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const stockRoutes = require('./routes/stockRoutes');
const billRoutes =  require('./routes/billRoutes');
const discountRoutes = require('./routes/discountRoutes')
connectDB();
const supplierRoutes = require('./routes/supplierRoutes');
const alertRoutes = require('./routes/alertRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const returnRoutes = require('./routes/returnRoutes');
const wastageRoutes = require('./routes/wastageRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/wastage', wastageRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));