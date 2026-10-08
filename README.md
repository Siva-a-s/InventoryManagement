# Smart Inventory Management System

A MERN inventory and point-of-sale application for managing products, suppliers, stock batches, purchase orders, billing, returns, and wastage. It includes owner and staff accounts, expiry-aware stock handling, alerts, and business reports for day-to-day inventory operations.

## Features

### Authentication and user management
- JWT-based login for owner and staff accounts.
- Owner-managed staff creation, listing, and removal or deactivation when a staff account has transaction history.
- Backend authentication and role checks for protected operations.
- The backend supports one-time owner signup while no owner account exists; the frontend currently provides a login page, not a signup page.

### Products, categories, and suppliers
- Owner-managed product and category records, including product unit, price, barcode, reorder level, and expiry alert window.
- Supplier records include contact details, supplied products, and an active/inactive status.
- Product and supplier records with transaction history are deactivated instead of deleted, preserving related records.
- Search and filter controls are available on relevant product, category, supplier, bill, and inventory views.

### Purchase orders and inventory
- Create and manage purchase orders with suppliers, products, quantities, unit costs, expected dates, and notes.
- Creating an order does not add stock. Receiving it creates inventory stock batches; owner and staff can receive orders, while order creation and cancellation are owner-only.
- Purchase order receipt notifications can be emailed to the configured owner address.
- Inventory is batch-based and records quantities, costs, supplier, purchase date, optional expiry, and remaining quantity.
- Manual stock entry and purchase order receipts both add batches. Stock changes as sales, returns, and wastage are processed.
- Selling uses FEFO (first expiry, first out): eligible batches with the earliest expiry are allocated first, with no-expiry batches after dated batches. Expired stock is excluded from sellable stock.
- Inventory and alert views identify low stock, near-expiry, and expired stock.
- Stock, purchase order, return, and wastage list APIs support pagination; the inventory page loads stock pages as needed.

### Billing and offers
- POS workflow supports cart entry, bill preview, checkout, cash/UPI/card payments, customer details, and bill history.
- The server calculates prices and discounts; the client does not supply authoritative totals.
- Active, date-valid product offers can be percentage or per-unit amount discounts. If multiple offers apply, the best per-unit saving is selected rather than stacking offers.
- Checkout reduces stock from the allocated batches and stores the bill and batch allocation.
- Owners can cancel bills; the backend restores quantities recorded against the bill's batches, subject to cancellation checks.

### Returns and wastage
- Process product returns against a bill with a reason, refund method, and optional restocking.
- Refund amounts are calculated and stored by the backend. Return history is displayed on the Returns page.
- Restocking restores eligible quantities to suitable original sale batches. Damaged and expired returns cannot be restocked.
- Record wastage for expired, damaged, spoiled, lost, or other reasons. Wastage records include quantity and cost.
- Owners can write off remaining expired stock; the write-off reduces batch stock and creates wastage records.

### Alerts and reports
- Dashboard shows product, stock, sales, pending purchase order, and alert summaries.
- Alerts include low-stock and expiry information.
- Business reports include sales/revenue, refunds, net revenue, wastage loss, sales trends, top-selling products, purchase analysis, supplier purchase analysis, COGS, gross profit, gross margin, product profitability, and inventory health.
- The backend also exposes a sales-by-category report API; it is not currently shown as a section in the Reports page.

## Technology Stack

**Frontend:** React, Vite, React Router, Axios, Lucide React, CSS

**Backend:** Node.js, Express.js, MongoDB, Mongoose, JWT (jsonwebtoken), bcryptjs, Nodemailer

## Application Workflow

~~~text
Supplier → Purchase Order → Receive Stock → Inventory Batches
         → Billing → FEFO Stock Reduction
         → Returns / Wastage → Reports
~~~

A purchase order is a record of planned purchasing; stock enters inventory when the order is received. Received items become separate stock batches with costs and optional expiry dates. Billing previews and checkout use the backend calculation, apply any qualifying offer, and decrement batches in FEFO order. Returns store backend-calculated refunds and may restore eligible items to their original sale batches. Wastage records stock removed from batches and its cost. Reports use stored sales, returns, purchase, inventory, and wastage data.

## User Roles

### Owner
- Manage products, categories, suppliers, staff accounts, and discounts/offers.
- Add stock, correct or delete eligible stock batches, and manage purchase orders.
- Create and cancel purchase orders; receive purchase orders.
- Create bills and process returns; cancel bills.
- Access reports and manage wastage, including expired stock write-off.

### Staff
- View products, suppliers, inventory, bills, purchase orders, alerts, and returns.
- Add stock and receive purchase orders.
- Create bills and process returns.
- Staff cannot access owner-only management and reporting operations enforced by the backend.

## Project Structure

~~~text
InventoryManagement/
├── backend/
│   ├── config/          # MongoDB connection
│   ├── controllers/     # Request handlers and business logic
│   ├── middleware/      # JWT authentication and role checks
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express API routes
│   ├── services/        # Email service
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── public/          # Static assets
│   ├── src/
│   │   ├── assets/
│   │   ├── components/  # Layout and navigation
│   │   ├── pages/       # Application screens
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
└── README.md
~~~

## Installation and Setup

### 1. Clone the repository

Replace the placeholder with your repository URL:

~~~bash
git clone <repository-url>
cd InventoryManagement
~~~

### 2. Configure and start the backend

~~~bash
cd backend
npm install
~~~

Create backend/.env with the required database URI and JWT signing secret. PORT is optional and defaults to 5000.

~~~env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_jwt_secret
PORT=5000
~~~

To enable purchase order receipt emails, also configure EMAIL_USER and EMAIL_PASS for the Gmail account used by the Nodemailer service. Keep all credentials private and out of Git.

Start the API:

~~~bash
npm run dev
~~~

The frontend currently calls http://localhost:5000 directly, so run the backend on port 5000 for the unmodified frontend.

### 3. Create the initial owner

There is no signup screen in the frontend. Before logging in for the first time, create the owner by sending a POST request to http://localhost:5000/api/auth/signup with JSON fields name, email, and password. This endpoint only creates an owner when no owner account exists.

### 4. Install and start the frontend

In another terminal:

~~~bash
cd frontend
npm install
npm run dev
~~~

Open the local URL printed by Vite in the terminal.

Available frontend scripts include npm run build and npm run lint.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| MONGO_URI | Yes | MongoDB connection string |
| JWT_SECRET | Yes | Signs and verifies authentication tokens |
| PORT | No | Backend port; defaults to 5000 |
| EMAIL_USER | For email notifications | Gmail sender account for purchase order receipt notifications |
| EMAIL_PASS | For email notifications | Gmail account credential used by Nodemailer |

## API Overview

The Express API is mounted under these groups:

~~~text
/api/auth
/api/products
/api/categories
/api/stock
/api/bills
/api/discounts
/api/suppliers
/api/alerts
/api/purchase-orders
/api/reports
/api/returns
/api/wastage
~~~

Protected routes require a bearer JWT. Role requirements vary by operation; see backend/routes/ for the current route-level access rules.

## Business Logic Highlights

- Inventory quantity is tracked per stock batch, with batch cost and optional expiry information.
- FEFO batch allocation prioritizes the earliest eligible expiry date; batches without an expiry date are considered after expiring batches.
- Expired batches are not eligible for sale. Expired write-off is an owner operation that records wastage.
- Purchase order creation alone does not change inventory. Receiving stock creates batches.
- Bill preview and checkout share server-side price/offer calculations. Checkout stores the applied values and reduces stock from the selected batches.
- Returns are linked to bills, cannot exceed the remaining returnable quantity, and store their refund values. Restocking is limited to suitable original batches and is disabled for damaged or expired items.
- Bill cancellation is owner-only and restores allocated batch quantities when the bill passes the backend cancellation checks.
- Reports account for completed bills, recorded returns, purchase costs, inventory, and wastage as appropriate to each report.

## Future Enhancements

Potential future work could include receipt/PDF generation, OCR-based invoice entry, payment gateway integration, demand forecasting, and additional analytics. These are not current features of the application.

## Security Notes

The backend issues JWTs, hashes passwords with bcryptjs, and applies authentication and role-check middleware to protected APIs. Keep .env values and credentials private. The frontend currently keeps its login token in browser localStorage; review the authentication/storage approach before a production deployment.

## Project Status

This is an academic Smart Inventory Management project developed as part of the ICTAK MERN course.
