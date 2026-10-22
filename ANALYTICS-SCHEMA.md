# Zoho Analytics schema — the owner's workspace

_Read on 22 Oct 2026 through the dashboard's read-only Zoho Analytics connection (`src/lib/zohoAnalytics.ts`, Admin → Zoho Analytics). Metadata only — table and column names, types, row counts; no data. Companion to ANALYTICS-PLAN.md §2b.2._

Workspace `421000000000021002` (organisation *thinkhealthcareandsafety*): 28 QueryTable · 85 Pivot · 110 Table · 224 AnalysisView · 18 Dashboard · 4 SummaryView · 6 Report.

## Dashboards
All Sales Data · Business Intelligence · Customers (2021-2027) · Customers Insights Dashboard · Dashboard (2021-2027) · Extra - I · Extra - II · Finance Overview Dashboard · Financial Statement Dashboard · Inventory Dashboard · Inventory Sales Orders and Invoices Dashboard · Inventory Shipment and Sales Returns Dashboard · Invoice Overview Dashboard · Marriot Dashboard · Purchases and Payables Dashboard · Sales and Receivables Dashboard · Vendor Insights Dashboard · Zoho Commerce Dashboard

## Query tables (the owner's own formulas)
Zoho's API returns their columns and the tables they read, **not the SQL** — copy the SQL from each one's *Edit* screen when it is rebuilt here. (Row counts show 0: query tables are computed when opened.)

| Query table | Built from | Columns |
|---|---|---|
| 25-26 Type Difference | Customers, Invoices | Customer Type, FY 2025, FY 2026, Positive, Negative |
| As on Date - Inventory | Sales Orders, Stock In Flow Table, Sales Order Items, Stock Out Flow Table, Inventory Adjustment Items, FIFO Mapping Table, Transfer Order, Transfer Order Items | Type, PK, Product Id, Warehouse ID, Date, Purchased Quantity, Sold Quantity, Stock In Flow Table.Total (BCY), Committed Stock |
| Cash Flow Query | Accounts, Accrual Transactions | CashFlow, Account Name, Account Type, Cash Flow Type, Transaction Date |
| Committed Stock Per Item | Sales Orders, Sales Order Items | soi.Item Name, Committed Stock |
| Conversion Marriot | Customers, Invoices | Total Marriott Customers, Marriott Customers with Invoices, Conversion Rate (%) |
| Customer Churn data | Customers, Invoices | Customer Name, Type, Sector, Days Since Last Purchase, Last Invoice Date, Number of Invoices, Pre-FY25 Sales, FY2025 Sales, FY2026 Sales |
| Customer Churn Risk | Customers, Invoices | c.Customer Name, c.Customer ID, c.Type, c.Sector, Total Invoices, Total Revenue, Avg Order Value, First Invoice Date, Last Invoice Date, Days Since Last Purchase, Churn Status, Churn Risk Score, FY25 Revenue, FY26 Revenue |
| Customer Sector/Type | Customers, Invoices | Customer Name, Type, Sector |
| Details query | Customers, Invoices, Customer Addresses, Sales Orders, Shipment Order, Sales Order Invoice | Customer Name, Invoice Number, Sale Order Number, First Name, Last Name, Customer Type, GSTIN, Business Type, Lead Source, Product Type, Shipped By, Shipment Status, Shipment Tracking Number, Email, Accountant's Email, Contact, City, State |
| FY State Revenue Comparison | Invoices, Customer Addresses | States, FY 2025, FY 2026, Positive, Negative |
| Inventory Stock Summary | Committed Stock Per Item, Stock On Hand Per Item | soh.Item Name, soh.Stock On Hand, Committed Stock, Available For Sale |
| Invoiced Marriot | Customers, Invoices, Customer Addresses | Company Name, Contact Name, Phone, Email, Billing State, Billing City |
| KPI | Customers, Invoices, Salespersons | C.Customer Name, Customer Type, I.Invoice Date, I.Invoice Number, Sales Person Name |
| Last date bill items | Items, Bills, Bill Item | bi.Item Name, Last Billed Date |
| New Query Table | Invoices, Customer Addresses | Billing State, FY 2025, FY 2026 |
| Outstanding marriot | Customers, Invoices | Customer_Name, Customer_ID, Invoice_Number, Invoice_Date, Due_Date, Days_Past_Due, Age_Tier, Outstanding_Balance, Expected_Payment_Date, Marriott_Risk_Status |
| Product Price | Invoice Items | Item Name, Average Selling Price, Total Quantity, Total (BCY) |
| Product Price (Year Filter) | Invoices, Invoice Items | Product Name, Date of Invoice, Average Selling Price, Total Quantity, Total Sales |
| q.value | Salespersons, Quotes | q.Quote Number, Quote Date, q.Status, q.Total (BCY), s.Name |
| Remaining Marriot | Customers, Invoices, Customer Addresses | Company Name, Contact Name, Phone, Email, Billing State, Billing City |
| Sales (Sector) | Customers, Invoices | c.Customer Name, c.Sector, i.Invoice Date, round(sum(i.Total (BCY)), 0) |
| Sector Difference 25-26 | Customers, Invoices | Customer Sector, FY 2025, FY 2026, Positive, Negative |
| single invoice customers | Customers, Invoices | c.Customer Name |
| State Difference 25-26 | Invoices, Customer Addresses | States, FY 2025, FY 2026, Positive, Negative |
| Stock In Hand | Stock In Flow Table, Quote Items | Item Name, Stock In Hand, Positive In Hand, Negative In Hand |
| Stock In Per Item | Items, Stock In Flow Table | i.Item Name, sif.Product ID, Total In |
| Stock On Hand Per Item | Stock Out Per Item, Stock In Per Item | Item Name, Stock On Hand |
| Stock Out Per Item | Stock Out Flow Table | sof.Product ID, Total Out |

## Tables (synced from Zoho Books / Inventory / Commerce)
Empty (not used by the business): Bill Of Entry, Bill Of Entry Item, Budget Details, Budgets, Bundle, Bundle Items, Credit Notes Refund, Delivery Challans Invoice, Manual Journal Credits, Project User, Projects, Recurring Expenses, Reporting Tags, Sales Return, Sales Return Items, Sales Return Receive, Sales Return Receive Items, Serial Numbers, Shipping Bill, Shipping Bill Item, SMS Notifications, Tasks, Timesheet, Transfer Order, Transfer Order Items, Vendor Credit Refunds.

### Accrual Transactions — 42,449 rows
_This table contains the Accural Transaction module data from Zoho Expense, Zoho Books and Zoho Inventory_
`Accrual Transaction ID` Number · `Entity Type` Plain Text · `Account ID` Number → Accounts.Account ID · `Entity ID` Number · `Transaction Number` Plain Text · `Transaction Amount (BCY)` Currency · `Debit or Credit` Plain Text · `Transaction Date` Date · `Currency Code` Plain Text · `Reference Number` Plain Text · `Tax ID` Number → Taxes.Tax ID · `Taxable Amount (BCY)` Currency · `Description` Plain Text (formula) · `Debit Amount` Currency (formula) · `Credit Amount` Decimal Number (formula) · `Debit - Credit` Decimal Number (formula) · `Credit - Debit` Decimal Number (formula) · `Number of Days` Number (formula) · `Customer ID` Number → Customers.Customer ID · `Vendor ID` Number → Vendors.Vendor ID · `Project ID` Number → Projects.Project ID · `Transaction ID` Number · `Reference No.` Plain Text · `Transaction Amount (FCY)` Currency · `Taxable Amount (FCY)` Currency · `Statement Line ID` Number → Bank Statements.Statement Line ID · `Last Modified Time` Date · `Transaction Amount (Debit - Credit)` Decimal Number (formula) · `Transaction Amount (Credit - Debit)` Decimal Number (formula) · `Warehouse ID` Number → Warehouses.Warehouse ID · `Location ID` Number → Locations.Location ID

### Cash Transactions — 42,277 rows
_This table contains the Cash Transactions module data from Zoho Books and Zoho Inventory_
`Cash Transaction ID` Number · `Entity Type` Plain Text · `Entity ID` Number · `Transaction Number` Plain Text · `Transaction Amount (BCY)` Currency · `Account ID` Number → Accounts.Account ID · `Debit or Credit` Plain Text · `Transaction Date` Date · `Currency Code` Plain Text · `Taxable Amount (BCY)` Currency · `transaction_id` Number · `Customer ID` Number → Customers.Customer ID · `Vendor ID` Number → Vendors.Vendor ID · `Transaction ID` Number · `Reference Number` Plain Text · `Reference No.` Plain Text · `Transaction Amount (FCY)` Currency · `Tax ID` Number → Taxes.Tax ID · `Taxable Amount (FCY)` Currency · `Last Modified Time` Date · `Location ID` Number → Locations.Location ID

### Customer Addresses — 7,341 rows
_This table contains the Customer Address data_
`Address ID` Number · `Customer ID` Number → Customers.Customer ID · `Shipping Address Attention` Plain Text · `Shipping Street` Plain Text · `Shipping City` Plain Text · `Shipping State` Plain Text · `Shipping Country` Plain Text · `Shipping Code` Plain Text · `Shipping Fax` Plain Text · `Billing Address Attention` Plain Text · `Billing Street` Plain Text · `Billing City` Plain Text · `Billing State` Plain Text · `Billing Country` Plain Text · `Billing Code` Plain Text · `Billing Fax` Plain Text · `Created Time` Date · `Last Modified Time` Date · `Shipping Street 2` Plain Text · `Billing Street 2` Plain Text · `Shipping Phone` Plain Text · `Billing Phone` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Quote Items — 5,389 rows
_This table contains the Estimate Item module data from Zoho Books, Invoice and Inventory_
`Item ID` Number · `Quote ID` Number → Quotes.Quote ID · `Product ID` Number → Items.Item ID · `Item Name` Plain Text · `Quantity` Decimal Number · `Discount Amount (BCY)` Currency · `Tax Amount` Currency · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Last Modified Time` Date · `Created Time` Date · `Discount Type` Plain Text · `Product Category` Plain Text · `HSN/SAC` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Project ID` Number → Projects.Project ID · `Description` Plain Text · `Item Price` Currency · `Entity Discount Percent` Percentage · `Discount Amount (FCY)` Currency · `Is Inclusive Tax` Yes/No Decision · `Tax ID` Number → Taxes.Tax ID · `FCY Tax Amount` Currency · `Source` Plain Text · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Expense ID` Number → Expenses.Expense ID · `Currency Code` Plain Text · `Place Of Supply` Plain Text · `Tax Exemption ID` Number · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `CRM Reference ID` Number

### Customer Contact Persons — 4,292 rows
_This table contains the Customer Contact Persons data_
`Contact Person ID` Number · `Customer ID` Number → Customers.Customer ID · `First Name` Plain Text · `Last Name` Plain Text · `Salutation` Plain Text · `Email` Plain Text · `Phone` Plain Text · `Mobile Phone` Plain Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `CRM Reference ID` Number

### Customers — 4,120 rows
_This table contains the Contacts module data form Zoho Books, Zoho Invoice, Zoho Inventory, Zoho Expense and Zoho Subscriptions_
`Customer ID` Number · `Customer Name` Plain Text → Sales (Sector).c.Customer Name · `Display Name` Plain Text · `Status` Plain Text · `Created Time` Date · `Company Name` Plain Text · `First Name` Plain Text · `Last Name` Plain Text · `Last Modified Time` Date · `Salutation` Plain Text · `Email` Plain Text · `Phone` Plain Text · `Mobile Phone` Plain Text · `Credit Limit` Currency · `Payments Due` Number · `Payment Terms Label` Plain Text · `Currency Code` Plain Text · `Notes` Multi Line Text · `Website` Plain Text · `Customer Sub Type` Plain Text · `Default Address ID` Number · `Customer Owner ID` Number → Users.User ID · `Place Of Supply` Plain Text · `Tax Exemption ID` Number · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Zoho Project Reference ID` Number · `Source` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Accounts Receivable` Number → Accounts.Account ID · `Opening Balance` Currency · `Bank Account Payment` Yes/No Decision · `Portal Enabled` Yes/No Decision · `PAN Number` Plain Text · `Taxable` Yes/No Decision · `Tax ID` Number → Taxes.Tax ID · `Type` Plain Text · `Sector` Plain Text · `CRM Reference ID` Number · `Special Identifier` Plain Text · `Accounts Email Id` Plain Text

### FIFO Mapping Table — 3,871 rows
_This table shows FIFO Mapping details of Zoho Inventory_
`Stock In Flow ID` Number → Stock In Flow Table.Stock In Flow ID · `Stock Out Flow ID` Number → Stock Out Flow Table.Stock Out Flow ID · `Product ID` Number → Items.Item ID · `Quantity Taken` Decimal Number · `Total (BCY)` Currency · `Total (FCY)` Currency · `Warehouse ID` Number → Warehouses.Warehouse ID · `Last Modified Time` Date · `Warehouse Location ID` Number → Locations.Location ID

### Invoice Items — 3,632 rows
_This table contains the Invoices module data from Zoho Books, Zoho Invoice, Zoho Subscription and Zoho Inventory_
`Item ID` Number · `Invoice ID` Number → Invoices.Invoice ID · `Product ID` Number → Items.Item ID · `Item Name` Plain Text → Product Price.Item Name · `Quantity` Decimal Number · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Expense ID` Number → Expenses.Expense ID · `Project ID` Number → Projects.Project ID · `Last Modified Time` Date · `Created Time` Date · `Account` Number → Accounts.Account ID · `Bill Item ID` Number · `Description` Plain Text · `Entity Discount Percent` Percentage · `Is Discount Before Tax` Yes/No Decision · `Discount Amount (BCY)` Currency · `Discount Amount (FCY)` Currency · `Total (FCY)` Currency · `Currency Code` Plain Text · `Discount Type` Plain Text · `SO ItemID` Number → Sales Order Items.Item ID · `Product Category` Plain Text · `Item Price` Currency · `Is Inclusive Tax` Yes/No Decision · `Tax ID` Number → Taxes.Tax ID · `Tax Amount` Currency · `FCY Tax Amount` Currency · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `Tax Inclusive Total (BCY)` Currency · `Tax Inclusive Total (FCY)` Currency · `Source` Plain Text · `Tax Exemption ID` Number · `Sub Total (FCY)` Currency · `HSN/SAC` Plain Text · `Place Of Supply` Plain Text · `Warehouse ID` Number → Warehouses.Warehouse ID · `CRM Reference ID` Number · `Location ID` Number → Locations.Location ID

### Stock Out Flow Table — 3,261 rows
_This table shows Stock Out Flow details of Zoho Inventory Table_
`Stock Out Flow ID` Number · `Invoice Item ID` Number → Invoice Items.Item ID · `Product ID` Number → Items.Item ID · `Transaction Date` Date · `Stock Out Flow Number` Number · `Invoice ID` Number → Invoices.Invoice ID · `Vendor Credit ID` Number → Vendor Credits.Vendor Credit ID · `Vendor Credits Item ID` Number → Vendor Credit Items.Item ID · `Inventory Adjustment ID` Number → Inventory Adjustments.Inventory Adjustment ID · `Inventory Adjustment Item ID` Number → Inventory Adjustment Items.Inventory Adjustment Item ID · `EntityType` Plain Text · `Quantity Out` Decimal Number · `Quantity Physically Tracked` Decimal Number · `Last Modified Time` Date · `Warehouse ID` Number → Warehouses.Warehouse ID · `Warehouse Location ID` Number → Locations.Location ID

### Sales Order Items — 2,924 rows
_This table contains the Sales Order Item module data.It contains the information on Items that are used to create a Sales Order._
`Item ID` Number · `Product ID` Number → Items.Item ID · `Item Name` Plain Text · `Quantity` Decimal Number · `Quantity Shipped` Decimal Number · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Sales order ID` Number → Sales Orders.Sales order ID · `Item Price (BCY)` Currency · `Project ID` Number → Projects.Project ID · `Warehouse ID` Number → Warehouses.Warehouse ID · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Currency Code` Plain Text · `Account ID` Number → Accounts.Account ID · `Product Category` Plain Text · `Description` Plain Text · `HSN/SAC` Plain Text · `Place Of Supply` Plain Text · `Tax Exemption ID` Number · `Quantity Invoiced` Decimal Number · `Quantity Cancelled` Decimal Number · `Item Price (FCY)` Currency · `Entity Discount Percent` Percentage · `Discount Amount (FCY)` Currency · `Tax ID` Number → Taxes.Tax ID · `FCY Tax Amount` Currency · `Source` Plain Text · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Last Modified Time` Date · `Created Time` Date · `Quantity Packed` Decimal Number · `Non Package Quantity` Decimal Number · `Quantity Delivered` Decimal Number · `Invoiced Quantity Cancelled` Decimal Number · `Quantity Dropshipped` Decimal Number · `Manually Fulfilled Quantity` Decimal Number · `Discount Amount (BCY)` Currency · `Tax Amount` Currency · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `CRM Reference ID` Number

### Package Items — 2,560 rows
_This table contains the Package module data. It contains the information on Items that are used to create a package._
`Package Item ID` Number · `Package ID` Number → Packages.Package ID · `SO ItemID` Number → Sales Order Items.Item ID · `Product ID` Number → Items.Item ID · `Item Name` Plain Text · `Quantity Packed` Decimal Number · `Created Time` Date · `Modified Time` Date

### Quotes — 2,397 rows
_This table contains the Estimates module data from Zoho Books, Zoho Invoice and Zoho Inventory_
`Quote ID` Number · `Quote Date` Date · `Quote Number` Plain Text · `Status` Plain Text · `Customer ID` Number → Customers.Customer ID · `Due Date` Date · `Discount (%)` Currency · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Adjustment (BCY)` Currency · `Salesperson ID` Number → Salespersons.Salesperson ID · `Last Modified Time` Date · `Created Time` Date · `Purchase Order#` Plain Text · `Currency Code` Plain Text · `Exchange Rate` Currency · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Is Inclusive Tax` Yes/No Decision · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Adjustment (FCY)` Currency · `Address ID` Number → Customer Addresses.Address ID · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Payment Terms` Plain Text · `Payment Terms Label` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Source` Plain Text · `TCS Tax ID` Number → Taxes.Tax ID · `TCS Amount (BCY)` Currency · `TCS Amount (FCY)` Currency · `TDS TaxID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `Shipping Charge (FCY)` Currency · `Shipping Charge Tax ID` Number → Taxes.Tax ID · `Shipping Charge Tax Amount (FCY)` Currency · `Shipping Charge (BCY)` Currency · `Shipping Charge Tax Amount (BCY)` Currency · `CRM Potential ID` Number · `CRM Reference ID` Number

### Bill Item — 2,314 rows
_This table contains the Bill Items module data from Zoho Books and Zoho Inventory_
`Item ID` Number · `Bill ID` Number → Bills.Bill ID · `Product ID` Number → Items.Item ID · `Account ID` Number → Accounts.Account ID · `Item Name` Plain Text · `Price (BCY)` Currency · `Quantity` Decimal Number · `Tax Amount` Currency · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Warehouse ID` Number → Warehouses.Warehouse ID · `Last Modified Time` Date · `Customer ID` Number → Customers.Customer ID · `Currency Code` Plain Text · `Product Category` Plain Text · `ITC Eligibility` Plain Text · `HSN/SAC` Plain Text · `Destination Of Supply` Plain Text · `Tax Exemption ID` Number · `Description` Multi Line Text · `Purchase Receive Item ID` Number → Purchase Receive Items.Item ID · `Purchase Order Item ID` Number → Purchase Order Items.Item ID · `Usage unit` Plain Text · `Price (FCY)` Currency · `Tax ID` Number → Taxes.Tax ID · `FCY Tax Amount` Currency · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Project ID` Number → Projects.Project ID · `Created Time` Date · `Billable Status` Yes/No Decision · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (FCY)` Currency · `TDS Amount (BCY)` Currency · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency

### Stock In Flow Table — 2,210 rows
_This table shows Stock In Flow details of Zoho Inventory_
`Stock In Flow ID` Number · `Product ID` Number → Items.Item ID · `Bill ID` Number → Bills.Bill ID · `Transaction Date` Date · `Stock In Flow Number` Number · `Bill Item ID` Number → Bill Item.Item ID · `CreditNotes ID` Number → Credit Notes.CreditNotes ID · `Credit Notes Item ID` Number → Credit Note Items.Item ID · `Inventory Adjustment ID` Number → Inventory Adjustments.Inventory Adjustment ID · `Inventory Adjustment Item ID` Number → Inventory Adjustment Items.Inventory Adjustment Item ID · `EntityType` Plain Text · `Quantity In` Decimal Number · `Quantity Used` Decimal Number · `Quantity Available` Decimal Number · `Quantity Physically Tracked` Decimal Number · `Price (BCY)` Currency · `Price (FCY)` Currency · `Total (BCY)` Currency · `Total (FCY)` Currency · `Inventory Account ID` Number → Accounts.Account ID · `Purchase Account ID` Number → Accounts.Account ID · `Last Modified Time` Date · `Warehouse ID` Number → Warehouses.Warehouse ID · `Exchange Rate` Currency · `Stock In Hand` Decimal Number (formula) · `Warehouse Location ID` Number → Locations.Location ID

### Invoice Payments — 1,897 rows
_This table contains the Invoice Payments module data. It contains the information on Payments made to Invoices by the Customer._
`Invoice Payment ID` Number · `Payment ID` Number → Customer Payments.Payment ID · `Invoice ID` Number → Invoices.Invoice ID · `Amount (BCY)` Currency · `Created Time` Date · `Invoice Amount` Currency · `Invoice Payment Applied Date` Date · `TDS Amount (FCY)` Currency · `TDS Amount (BCY)` Currency · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Last Modified Time` Date · `Location ID` Number → Locations.Location ID

### Bank Statements — 1,895 rows
_This table contains the Banking Transactions module data Zoho Expense, Zoho Books and Zoho Inventory_
`Statement ID` Number · `Statement Line ID` Number · `Account ID` Number → Accounts.Account ID · `Date` Date · `Debit or Credit` Plain Text · `Amount` Currency · `Payee` Plain Text · `Description` Plain Text · `Reference Number` Plain Text · `Status` Plain Text · `Exclude Description` Plain Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Customer Payments — 1,812 rows
_This table contains the Customer Payments module data. It contains the information on Payments made by the Customer._
`Payment ID` Number · `Payment Number` Plain Text · `Payment Date` Date · `Customer ID` Number → Customers.Customer ID · `Amount (BCY)` Currency · `Unused Amount (BCY)` Currency · `Created Time` Date · `Payment Mode` Plain Text · `Description` Multi Line Text · `Exchange Rate` Decimal Number · `Account ID` Number → Accounts.Account ID · `Amount (FCY)` Currency · `Unused Amount (FCY)` Currency · `Refund Amount (BCY)` Currency · `Refund Amount (FCY)` Currency · `Bank Charges (FCY)` Currency · `Bank Charges (BCY)` Currency · `Withholding Tax (BCY)` Currency · `Withholding Tax (FCY)` Currency · `Reference Number` Plain Text · `Currency Code` Plain Text · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Gateway Transaction ID` Plain Text · `Payment Status` Plain Text

### Invoices — 1,790 rows
_This table contains the Invoices module data  Zoho Books, Zoho Invoice, Zoho Subscription and Zoho Inventory_
`Invoice ID` Number · `Invoice Number` Plain Text · `Invoice Date` Date → Product Price (Year Filter).Date of Invoice · `Invoice Status` Plain Text · `Customer ID` Number → Customers.Customer ID · `Due Date` Date · `Discount (%)` Percentage · `Sub Total (BCY)` Currency · `Discount Amount` Currency (formula) · `Adjustment (BCY)` Currency · `Total (BCY)` Currency · `Salesperson ID` Number → Salespersons.Salesperson ID · `Created Time` Date · `Quote ID` Number → Quotes.Quote ID · `Age In Days` Number (formula) · `Age Tier` Plain Text (formula) · `Balance (BCY)` Currency · `Purchase Order#` Plain Text · `Exchange Rate` Decimal Number · `Write Off Amount (BCY)` Currency · `Last Modified Time` Date · `Discount Amount (BCY)` Currency · `Discount Amount (FCY)` Currency · `Transaction Type` Plain Text · `Status` Plain Text (formula) · `Service Start Date` Date · `Service End Date` Date · `Currency Code` Plain Text · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `TDS TaxID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `Write Off Date` Date · `Write Off Description` Multi Line Text · `Write Off Amount (FCY)` Currency · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Balance (FCY)` Currency · `Adjustment (FCY)` Currency · `Expected Payment Date` Date · `Last Payment Date` Date · `Payment Terms` Number · `Payment Terms Label` Plain Text · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `e-Way Bill#` Number · `e-Way Bill Generated Time` Date · `e-Way Bill Status` Plain Text · `e-Way Bill Cancelled Time` Date · `e-Way Bill Expired Time` Date · `Transporter Name` Plain Text · `Transporter ID` Plain Text · `Address ID` Number → Customer Addresses.Address ID · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Source` Plain Text · `Recurring Invoice ID` Number → Recurring Invoice.Recurring Invoice ID · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `TCS Tax ID` Number → Taxes.Tax ID · `TCS Amount (BCY)` Currency · `TCS Amount (FCY)` Currency · `Reference Invoice Id` Number · `Reference Invoice Type` Plain Text · `Reason for Debit Note` Plain Text · `Is Inclusive Tax` Yes/No Decision · `Shipping Charge (FCY)` Currency · `Shipping Charge Tax ID` Number → Taxes.Tax ID · `Shipping Charge Tax Amount (FCY)` Currency · `Shipping Charge (BCY)` Currency · `Shipping Charge Tax Amount (BCY)` Currency · `CGST Amount` Currency · `SGST Amount` Currency · `IGST Amount` Currency · `CESS Amount` Currency · `Purchase Order Number` Plain Text · `Business Type` Plain Text · `Lead Source` Plain Text · `Product Type` Multi Line Text · `Trainer Name` Plain Text · `Total Retention Amount (FCY)` Currency · `Total Retention Amount (BCY)` Currency · `Training Date` Date · `Certificate Expiry` Date · `Shipped by` Plain Text · `CRM Reference ID` Number · `CRM Potential ID` Number · `Tracking Details` Plain Text · `Freight Incurred` Currency · `Location ID` Number → Locations.Location ID

### Payments Made — 1,658 rows
_This table contains the Vendor Payments module data. It contains the information on Payments made to Vendors._
`Bill Payment ID` Number · `Vendor Payment ID` Number → Vendor Payments.Vendor Payment ID · `Bill ID` Number → Bills.Bill ID · `Amount (BCY)` Currency · `Created Time` Date · `Last Modified Time` Date · `Bill Amount` Currency · `Bill Payment Applied Date` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Withholding Tax Amount` Currency · `Withholding Tax Amount (BCY)` Currency · `Location ID` Number → Locations.Location ID

### Sales Orders — 1,483 rows
_This table contains the Sales Order module data from Zoho Books and Zoho Inventory_
`Sales order ID` Number · `Order Date` Date · `Sales Order#` Plain Text · `Status` Plain Text · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Discount Amount (BCY)` Currency · `Adjustment (BCY)` Currency · `Created Time` Date · `Customer ID` Number → Customers.Customer ID · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Discount (%)` Percentage · `Last Modified Time` Date · `Expected Shipment Date` Date · `Salesperson ID` Number → Salespersons.Salesperson ID · `Invoiced Status` Plain Text · `Paid Status` Plain Text · `Quote ID` Number → Quotes.Quote ID · `Address ID` Number → Customer Addresses.Address ID · `Reference Number` Plain Text · `Delivery Method` Plain Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Source` Plain Text · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Sales Channel` Plain Text · `Payment Terms Label` Plain Text · `TDS TaxID` Number → Taxes.Tax ID · `Withholding Tax (BCY)` Currency · `Withholding Tax (FCY)` Currency · `TCS Tax ID` Number → Taxes.Tax ID · `TCS Amount (BCY)` Currency · `TCS Amount (FCY)` Currency · `Is Inclusive Tax` Yes/No Decision · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Discount Amount (FCY)` Currency · `Shipping Charge (FCY)` Currency · `Shipping Charge Tax ID` Number → Taxes.Tax ID · `Shipping Charge Tax Amount (FCY)` Currency · `Shipping Charge (BCY)` Currency · `Shipping Charge Tax Amount (BCY)` Currency · `Adjustment (FCY)` Currency · `Adjustment Description` Plain Text · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Purchase Order Number #` Plain Text · `CRM Potential ID` Number · `CRM Reference ID` Number

### Bills — 1,398 rows
_This table contains the Bill module data form Zoho Books and Zoho Inventory_
`Bill ID` Number · `Bill Number` Plain Text · `Bill Date` Date · `Bill Status` Plain Text · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Created Time` Date · `Vendor ID` Number → Vendors.Vendor ID · `Age in Days` Number (formula) · `Age in Tier` Plain Text (formula) · `Due Date` Date · `Discount (%)` Percentage · `Last Modified Time` Date · `Purchase Order` Plain Text · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Balance (BCY)` Currency · `Discount Amount (BCY)` Currency · `Expected Payment Date` Date · `Description` Multi Line Text · `Discount Amount (FCY)` Currency · `Payment Terms` Number · `Payment Terms Label` Plain Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Address ID` Number → Vendor Addresses.Address ID · `Recurring Bill ID` Number → Recurring Bills.Recurring Bill ID · `TDS TaxID` Number → Taxes.Tax ID · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Balance (FCY)` Currency · `Withholding Tax (BCY)` Currency · `Withholding Tax (FCY)` Currency · `TCS Tax ID` Number → Taxes.Tax ID · `TCS Amount (BCY)` Currency · `TCS Amount (FCY)` Currency · `Vendor Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Adjustment` Currency · `Adjustment Description` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `CGST Amount` Currency · `SGST Amount` Currency · `IGST Amount` Currency · `CESS Amount` Currency

### Traffic Session — 1,342 rows
`Page ID` Number · `Page Type` Plain Text · `Access Date` Date · `Unique session count` Number · `Category ID` Number → Category.Category ID · `Product ID` Number → Item Group.Group ID

### Packages — 1,337 rows
_This table contains the Package module data from Zoho Inventory._
`Package ID` Number · `Packing Date` Date · `Packing Number` Plain Text · `Notes` Plain Text · `Salesorder ID` Number → Sales Orders.Sales order ID · `Shipment ID` Number → Shipment Order.Shipment ID · `Created Time` Date · `Modified Time` Date

### Shipment Order — 1,334 rows
_This table contains the Shipment Order module data from Zoho Inventory_
`Shipment ID` Number · `Expected Shipment Date` Date · `ShipmentOrderNumber` Plain Text · `Status` Plain Text · `Shipment Type` Plain Text · `Carrier` Plain Text · `Tracking Number` Plain Text · `Shipping Charge` Currency · `Salesorder ID` Number → Sales Orders.Sales order ID · `Notes` Plain Text · `Created Time` Date · `Modified Time` Date · `Delivery Date` Date · `Manifest Link` Plain Text · `Thermal Label Link` Plain Text · `Label Link` Plain Text

### Sales Order Invoice — 1,317 rows
_This table contains the Sales Order Invoice module data. It contains the information on Sales Order converted to Invoices._
`Invoice ID` Number → Invoices.Invoice ID · `Sales order ID` Number → Sales Orders.Sales order ID · `Last Modified Time` Date

### Vendor Payments — 1,305 rows
_This table contains the Vednor Payments module data. It contains the information on Payments made to the vendors._
`Vendor Payment ID` Number · `Payment Number` Plain Text · `Payment Date` Date · `Vendor ID` Number → Vendors.Vendor ID · `Amount (BCY)` Currency · `Created Time` Date · `Unused Amount (BCY)` Currency · `Payment Number Prefix` Plain Text · `Payment Number Suffix` Number · `Payment Mode` Plain Text · `Description` Multi Line Text · `Exchange Rate` Decimal Number · `Account ID` Number → Accounts.Account ID · `Deposit To Account ID` Number → Accounts.Account ID · `TDS TaxID` Number → Taxes.Tax ID · `Amount (FCY)` Currency · `Unused Amount (FCY)` Currency · `Refund Amount (BCY)` Currency · `Refund Amount (FCY)` Currency · `Withholding Tax (BCY)` Currency · `Withholding Tax (FCY)` Currency · `Reference Number` Plain Text · `Currency Code` Plain Text · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Payment Type` Plain Text · `Payment Status` Plain Text · `Bank Reference Number` Plain Text

### Traffic Users — 1,230 rows
`Page ID` Number · `Page Type` Plain Text · `Device Name` Plain Text · `Country Name` Plain Text · `Region Name` Plain Text · `City Name` Plain Text · `Refer Name` Plain Text · `Access Date` Date · `Unique session count` Number · `Category ID` Number → Category.Category ID · `Product ID` Number → Item Group.Group ID

### Invoiced Quotes — 1,177 rows
`Invoice ID` Number → Invoices.Invoice ID · `Quote ID` Number → Quotes.Quote ID · `Last Modified Time` Date

### Items — 1,113 rows
_This table contains the Item module data_
`Item ID` Number · `Item Name` Plain Text · `Status` Plain Text · `Purchase Account` Number → Accounts.Account ID · `Sales Account` Number → Accounts.Account ID · `Type` Plain Text · `Purchase Price` Currency · `Usage unit` Plain Text · `Sales Price` Currency · `Tax ID` Number → Taxes.Tax ID · `Returnable Items` Yes/No Decision · `Last Modified Time` Date · `Created Time` Date · `SKU` Plain Text · `UPC` Number · `MPN` Plain Text · `EAN` Number · `ISBN` Plain Text · `Brand` Plain Text · `Manufacturer` Plain Text · `Sales Description` Multi Line Text · `Purchase Description` Multi Line Text · `Product Category` Plain Text · `HSN/SAC` Plain Text · `Tax Exemption ID` Number · `Retail Price` Currency · `Inventory Account` Number → Accounts.Account ID · `Product Type` Plain Text · `Opening Stock` Decimal Number · `Opening Stock Value` Decimal Number · `Reorder Level` Decimal Number · `Source` Plain Text · `Preferred Vendor` Number → Vendors.Vendor ID · `Manufacturer ID` Number → Manufacturer.Manufacturer ID · `Brand ID` Number → Brand.Brand ID · `Group ID` Number → Item Group.Group ID · `Category ID` Number → Category.Category ID · `Package Weight` Decimal Number · `Package Length` Decimal Number · `Package Width` Decimal Number · `Package Height` Decimal Number · `Attribute Option ID1` Number → Attribute Options.Option ID · `Attribute Option ID2` Number → Attribute Options.Option ID · `Attribute Option ID3` Number → Attribute Options.Option ID · `Track Serial Number` Yes/No Decision · `Track Batches` Yes/No Decision · `Intra State Tax ID` Number → Taxes.Tax ID · `Inter State Tax ID` Number → Taxes.Tax ID · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `CRM Reference ID` Number · `Quotation Description` Multi Line Text · `Usage Video` Plain Text · `Maintenance Video` Plain Text · `Identifier` Multi Line Text · `Actual Stock June 2026` Number · `Item Identifier` Plain Text

### Purchase Order Items — 914 rows
_This table contains the Purchase Order Item module data from Zoho Books and Zoho Inventory_
`Item ID` Number · `Item Price (BCY)` Currency · `Item Name` Plain Text · `Quantity` Decimal Number · `Tax Amount` Currency · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Purchase Order ID` Number → Purchase Orders.Purchase Order ID · `Product ID` Number → Items.Item ID · `Warehouse ID` Number → Warehouses.Warehouse ID · `Currency Code` Plain Text · `Account ID` Number → Accounts.Account ID · `Product Category` Plain Text · `HSN/SAC` Plain Text · `Destination Of Supply` Plain Text · `Tax Exemption ID` Number · `Item Price (FCY)` Currency · `Item Description` Multi Line Text · `Usage unit` Plain Text · `Tax ID` Number → Taxes.Tax ID · `FCY Tax Amount` Currency · `Source` Plain Text · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Last Modified Time` Date · `Created Time` Date · `Quantity Billed` Decimal Number · `Quantity Cancelled` Decimal Number · `Project ID` Number → Projects.Project ID · `SO ItemID` Number → Sales Order Items.Item ID · `Quantity Received` Decimal Number · `Non Receive Quantity` Decimal Number · `Quantity Manually Received` Decimal Number · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency

### Purchase Orders — 527 rows
_This table contains the Purchase Order module data from Zoho Books and Zoho Inventory_
`Purchase Order ID` Number · `Purchase Order Number` Plain Text · `Purchase Order Date` Date · `Delivery Date` Date · `Purchase Order Status` Plain Text · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Created Time` Date · `Vendor ID` Number → Vendors.Vendor ID · `Attention Content` Plain Text · `Expected Delivery Date` Date · `Currency Code` Plain Text · `Date` Date · `Sales order ID` Number → Sales Orders.Sales order ID · `Last Modified Time` Date · `Reference number` Plain Text · `Payment Terms Label` Plain Text · `Billed Status` Plain Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Address ID` Number → Vendor Addresses.Address ID · `TDS TaxID` Number → Taxes.Tax ID · `Withholding Tax (BCY)` Currency · `Withholding Tax (FCY)` Currency · `Exchange Rate` Decimal Number · `Delivery Instructions` Multi Line Text · `Terms & Conditions` Multi Line Text · `Shipment preference` Multi Line Text · `Source` Plain Text · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `TCS Tax ID` Number → Taxes.Tax ID · `TCS Amount (BCY)` Currency · `TCS Amount (FCY)` Currency · `CRM Reference ID` Number

### Vendor Addresses — 500 rows
_This table contains data related to vendor address from Zoho Books and Zoho Inventory_
`Address ID` Number · `Vendor ID` Number → Vendors.Vendor ID · `Shipping Address Attention` Plain Text · `Shipping Street` Plain Text · `Shipping City` Plain Text · `Shipping State` Plain Text · `Shipping Country` Plain Text · `Shipping Code` Plain Text · `Shipping Fax` Plain Text · `Billing Address Attention` Plain Text · `Billing Street` Plain Text · `Billing City` Plain Text · `Billing State` Plain Text · `Billing Country` Plain Text · `Billing Code` Plain Text · `Billing Fax` Plain Text · `Created Time` Date · `Last Modified Time` Date · `Shipping Street 2` Plain Text · `Billing Street 2` Plain Text · `Shipping Phone` Plain Text · `Billing Phone` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Purchase Order Bill — 414 rows
_This table contains the Purchase Order Bill module data from Zoho Books and Zoho Inventory_
`Purchase Order ID` Number → Purchase Orders.Purchase Order ID · `Bill ID` Number → Bills.Bill ID · `Last Modified Time` Date

### Vendors — 368 rows
_This table contains the Vendors module data from Zoho Books and Inventory_
`Vendor ID` Number · `Vendor Name` Plain Text · `Display Name` Plain Text · `First Name` Plain Text · `Last Name` Plain Text · `Created Time` Date · `Company Name` Plain Text · `Currency Code` Plain Text · `Status` Plain Text · `Last Modified Time` Date · `Salutation` Plain Text · `Email` Plain Text · `Phone` Plain Text · `Default Address ID` Number · `Mobile Phone` Plain Text · `Payments Due` Number · `Payment Terms Label` Plain Text · `Notes` Multi Line Text · `Website` Plain Text · `Source Of Supply` Plain Text · `Tax Exemption ID` Number · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Source` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Opening Balance` Currency · `Accounts Payable` Number → Accounts.Account ID · `PAN Number` Plain Text · `MSME/Udyam No` Plain Text · `MSME/Udyam Type` Plain Text · `TDS TaxID` Number → Taxes.Tax ID · `CRM Reference ID` Number · `Type` Plain Text · `Sector` Plain Text · `Special Identifier` Plain Text · `Accounts Email Id` Plain Text

### Zone Address — 290 rows
`Address ID` Number · `Shipping Zone ID` Number → Shipping Zone.Shipping Zone ID · `Created Time` Date · `Last Modified Time` Date

### Delivery Challan Item — 276 rows
_This table contains the Delivery Challan Item module data from Zoho Books, Zoho Invoice and Zoho Inventory_
`Item ID` Number · `Delivery challan ID` Number → Delivery Challan.Delivery challan ID · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Currency Code` Plain Text · `Product ID` Number → Items.Item ID · `Item Name` Plain Text · `Account ID` Number → Accounts.Account ID · `Product Category` Plain Text · `Description` Multi Line Text · `HSN/SAC` Plain Text · `Place Of Supply` Plain Text · `Tax Exemption ID` Number · `Quantity` Decimal Number · `Quantity Invoiced` Decimal Number · `Item Price (BCY)` Currency · `Item Price (FCY)` Currency · `Entity Discount Percent` Percentage · `Discount Amount (FCY)` Currency · `Tax ID` Number → Taxes.Tax ID · `FCY Tax Amount` Currency · `Total (FCY)` Currency · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Sub Total (FCY)` Currency · `Last Modified Time` Date · `Created Time` Date · `Warehouse ID` Number → Warehouses.Warehouse ID · `Quantity Returned` Decimal Number · `Discount Amount (BCY)` Currency · `Location ID` Number → Locations.Location ID

### Vendor Contact Persons — 246 rows
_This table contains the Vendor Contact Person data_
`Contact Person ID` Number · `Vendor ID` Number → Vendors.Vendor ID · `First Name` Plain Text · `Last Name` Plain Text · `Salutation` Plain Text · `Email` Plain Text · `Phone` Plain Text · `Mobile Phone` Plain Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### System Mails — 228 rows
`Mail History ID` Number · `From Address` Plain Text · `To Address` Plain Text · `CC Address` Plain Text · `BCC Address` Plain Text · `Subject` Plain Text · `Date` Date · `Mail Type` Plain Text

### Item Group — 219 rows
_This table contains the Item Group module data from Zoho Inventory_
`Group ID` Number · `Product Name` Plain Text · `Usage unit` Plain Text · `Description` Plain Text · `Product Type` Plain Text · `Attribute Name 1` Plain Text · `Attribute Name 2` Plain Text · `Attribute Name 3` Plain Text · `Manufacturer ID` Number → Manufacturer.Manufacturer ID · `Brand ID` Number → Brand.Brand ID · `Attribute ID1` Number → Attribute.Attribute ID · `Attribute ID2` Number → Attribute.Attribute ID · `Attribute ID3` Number → Attribute.Attribute ID · `Sales Account` Number → Accounts.Account ID · `Purchase Account` Number → Accounts.Account ID · `Inventory Account` Number → Accounts.Account ID · `Category ID` Number → Category.Category ID · `Created Time` Date · `Modified Time` Date · `SEO Title` Plain Text · `SEO Keyword` Plain Text · `SEO Description` Plain Text

### Inventory Adjustment Items — 212 rows
_This tables shows the Inventory Adjustment Items_
`Inventory Adjustment Item ID` Number · `Price (BCY)` Currency · `Inventory Adjustment ID` Number → Inventory Adjustments.Inventory Adjustment ID · `Name` Plain Text · `Description` Plain Text · `Usage Unit` Plain Text · `Product ID` Number → Items.Item ID · `Quantity Adjusted` Decimal Number · `Value Adjusted` Currency · `Currency Code` Plain Text · `Total (FCY)` Currency · `Total` Currency · `Price (FCY)` Currency · `Inventory Account` Number → Accounts.Account ID · `Account ID` Number → Accounts.Account ID · `Created Time` Date · `Last Modified Time` Date · `Warehouse ID` Number → Warehouses.Warehouse ID · `Location ID` Number → Locations.Location ID

### Inventory Adjustments — 212 rows
_This table contains the Inventory Adjustments made in Items_
`Inventory Adjustment ID` Number · `Order Number` Plain Text · `Reason` Plain Text · `Total (BCY)` Currency · `Entity Type` Plain Text · `Description` Plain Text · `Status` Plain Text · `Total (FCY)` Currency · `Currency Code` Plain Text · `Inventory Adjustment Date` Date · `Created Time` Date · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Expense Item — 210 rows
_This table shows Expense Items module data in Zoho Expense._
`Expense Item ID` Number · `Expense ID` Number → Expenses.Expense ID · `Expense Description` Multi Line Text · `Project ID` Number → Projects.Project ID · `Expense Category` Plain Text · `Account ID` Number → Accounts.Account ID · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Tax Inclusive Total (BCY)` Currency · `Tax Inclusive Total (FCY)` Currency · `Tax ID` Number → Taxes.Tax ID · `Tax Amount` Currency · `FCY Tax Amount` Currency · `Last Modified Time` Date · `Created Time` Date · `Category ID` Number · `HSN/SAC` Plain Text · `Destination Of Supply` Plain Text · `Product Type` Plain Text · `ITC Eligibility` Plain Text · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `Reverse Charge Tax Name` Plain Text · `Reverse Charge Tax Rate` Decimal Number

### Expenses — 210 rows
_This table contains the Expenses module data from Zoho Books, Zoho Invoice and Zoho Inventory_
`Expense ID` Number · `Customer ID` Number → Customers.Customer ID · `Vendor ID` Number → Vendors.Vendor ID · `Expense Date` Date · `Is Billable` Yes/No Decision · `Total (BCY)` Currency · `Account ID` Number → Accounts.Account ID · `Paid Through` Number → Accounts.Account ID · `Created Time` Date · `Status` Plain Text (formula) · `Recurring Expense ID` Number → Recurring Expenses.Recurring Expense ID · `Reference Number` Plain Text · `Payment Mode` Plain Text · `Total (FCY)` Currency · `Sub Total (BCY)` Currency · `Sub Total (FCY)` Currency · `Mileage Rate` Decimal Number · `Mileage Unit` Plain Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Distance` Decimal Number · `Start Odometer Reading` Decimal Number · `End Odometer Reading` Decimal Number · `Mileage Type` Plain Text · `Merchant ID` Number · `Merchant Name` Plain Text · `User ID` Number → Users.User ID · `Report ID` Number · `Report Number` Plain Text · `Employee Paid Through` Number → Accounts.Account ID · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Travel Location` Plain Text · `Statement Line ID` Number → Bank Statements.Statement Line ID · `Last Modified Time` Date · `Source` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Expense Description` Multi Line Text · `Description` Multi Line Text · `Project ID` Number → Projects.Project ID · `Expense Category` Plain Text · `CRM Potential ID` Number

### Composite Item Details — 209 rows
_This table contains Composite Item module data. It contains the information on Composite Items._
`Item ID` Number · `Mapped Quantity` Decimal Number · `Last Modified Time` Date · `Created Time` Date

### Purchase Receive Items — 157 rows
_This table contains Purchase Receive Items module data_
`Purchase Receive ID` Number → Purchase Receive.Purchase Receive ID · `Purchase Order Item ID` Number → Purchase Order Items.Item ID · `Item ID` Number · `Quantity Received` Decimal Number · `Created Time` Date · `Last Modified Time` Date

### Accounts — 109 rows
_This table contains the Accounts module data from Zoho Books, Zoho Inventory and Zoho Subscriptions_
`Account ID` Number · `Account Name` Plain Text · `Account Type` Plain Text · `Created Time` Date · `Last Modified Time` Date · `Account Base Type` Plain Text · `Parent Account ID` Number · `Account Code` Plain Text · `Account Type Balance sheet` Plain Text (formula) · `Account Group` Plain Text (formula) · `Balance sheet base type` Plain Text (formula) · `Balance Sheet Account Type` Plain Text (formula) · `Balance Sheet Account Name` Plain Text (formula) · `P&L Base Type` Plain Text (formula) · `Account Type P&L` Plain Text (formula) · `Cash Flow - Type` Plain Text (formula) · `Base Type P&L` Plain Text (formula) · `P&L Gross Type` Plain Text (formula) · `P&L Operating Profit Type` Plain Text (formula) · `Cash Flow Type` Plain Text (formula) · `Description` Multi Line Text · `Active` Yes/No Decision · `Currency Code` Plain Text · `Owner ID` Number → Users.User ID · `Sub Type` Plain Text

### Brand — 109 rows
_This table shows brand details from Zoho Inventory_
`Brand ID` Number · `Name` Plain Text · `Last Modified Time` Date · `Created Time` Date

### Delivery Challan — 98 rows
_This table contains the Delivery Challan module data from Zoho Books, Invoice and Inventory_
`Delivery challan ID` Number · `Challan Date` Date · `Delivery Challan#` Plain Text · `Status` Plain Text · `Challan Type` Plain Text · `Customer ID` Number → Customers.Customer ID · `Address ID` Number → Customer Addresses.Address ID · `Reference Number` Plain Text · `Currency Code` Plain Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Discount (%)` Percentage · `Sub Total (BCY)` Currency · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Discount Amount (BCY)` Currency · `Discount Amount (FCY)` Currency · `Adjustment (BCY)` Currency · `Adjustment (FCY)` Currency · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Total (BCY)` Currency · `Exchange Rate` Decimal Number · `Location ID` Number → Locations.Location ID · `e-Way Bill#` Plain Text · `e-Way Bill Generated Time` Date · `e-Way Bill Status` Plain Text · `e-Way Bill Cancelled Time` Date · `e-Way Bill Expired Time` Date · `Transporter Name` Plain Text · `Transporter ID` Plain Text

### Purchase Receive — 93 rows
_This table contains the Purchase Receive module data_
`Purchase Receive ID` Number · `Purchase Order ID` Number → Purchase Orders.Purchase Order ID · `Date` Date · `Created Time` Date · `Last Modified Time` Date · `Purchase Receive#` Plain Text · `Reference#` Plain Text · `Notes` Multi Line Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Status` Plain Text

### Taxes — 44 rows
_This table contains the Tax module data_
`Tax ID` Number · `Tax Name` Plain Text · `Tax Type` Plain Text · `Tax Percentage` Decimal Number · `Deleted` Yes/No Decision · `Created Time` Date · `Last Modified Time` Date · `Tax category` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Start Date` Date · `End Date` Date · `Tax Display Name` Plain Text

### Composite Item — 43 rows
_This table contains Composite Item module data._
`Item ID` Number · `Composite Item Name` Plain Text · `Sales Account` Number → Accounts.Account ID · `Purchase Account` Number → Accounts.Account ID · `Inventory Account` Number → Accounts.Account ID · `Last Modified Time` Date · `Created Time` Date

### Category — 38 rows
_This table contains Category module data from Zoho Inventory_
`Category ID` Number · `Category Name` Plain Text · `Category URL` Plain Text · `Parent Category ID` Number · `Category Description` Plain Text · `Last Modified Time` Date · `Created Time` Date · `SEO Title` Plain Text · `SEO Keyword` Plain Text · `SEO Description` Plain Text

### User Details — 27 rows
`User ID` Number → Users.User ID · `Status` Plain Text · `App Name` Plain Text · `Role` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Created Time` Date · `Last Modified Time` Date

### Cart Item — 24 rows
`Cart ID` Number → Cart.Cart ID · `Item ID` Number · `Item Order` Number · `Product ID` Number → Items.Item ID · `Quantity Ordered` Decimal Number · `Created Time` Date · `Last Modified Time` Date

### Users — 16 rows
_This table shows the Users information from Zoho Books,   Zoho Invoices, Zoho Inventory, Zoho Subscriptions and Zoho Expenses_
`User ID` Number · `UserName` Plain Text · `Status` Plain Text · `Email` Plain Text · `Zoho Project Reference ID` Number · `Created By` Number · `Modified By` Number · `Purchase Order #` Number

### Cart — 12 rows
`Cart ID` Number · `Created Time` Date · `Last Modified Time` Date · `Expiry Time` Date · `IP Address` Plain Text · `Customer Email` Plain Text · `Invoice ID` Number → Invoices.Invoice ID · `Salesorder ID` Number → Sales Orders.Sales order ID

### Manufacturer — 12 rows
_This table shows the details of manufacturer from Zoho Inventory_
`Manufacturer ID` Number · `Name` Plain Text · `Last Modified Time` Date · `Created Time` Date

### Purchase Order Sales Order Mapping — 12 rows
`Purchase Order ID` Number → Purchase Orders.Purchase Order ID · `Sales order ID` Number → Sales Orders.Sales order ID · `Last Modified Time` Date

### Salespersons — 11 rows
_This table contains the Salesperson module data from Zoho Books, Inventory, Subscription and Inventory_
`Salesperson ID` Number · `Name` Plain Text · `Email` Plain Text · `Status` Plain Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Batch Number Out — 8 rows
_This table shows details of Batch Number Out of Zoho Inventory_
`Batch Out ID` Number · `Batch In ID` Number → Batch Number IN.Batch In ID · `Warehouse ID` Number → Warehouses.Warehouse ID · `Product ID` Number → Items.Item ID · `Quantity Out` Decimal Number · `Entity Type` Plain Text · `Invoice ID` Number → Invoices.Invoice ID · `Invoice Item ID` Number → Invoice Items.Item ID · `Vendor Credit ID` Number → Vendor Credits.Vendor Credit ID · `Vendor Credits Item ID` Number → Vendor Credit Items.Item ID · `Inventory Adjustment ID` Number → Inventory Adjustments.Inventory Adjustment ID · `Inventory Adjustment Item ID` Number → Inventory Adjustment Items.Inventory Adjustment Item ID · `Bundle ID` Number → Bundle.Bundle ID · `Bundle Item ID` Number → Bundle Items.Bundle Item ID · `Created Time` Date · `Last Modified Time` Date · `Package ID` Number → Packages.Package ID · `Package Item ID` Number → Package Items.Package Item ID

### Manual Journal Items — 8 rows
_This table contains item details of Journal_
`Journal Item ID` Number · `Journal ID` Number → Manual Journals.Journal ID · `Project ID` Number → Projects.Project ID · `Item Order` Number · `Account ID` Number → Accounts.Account ID · `Sub Total (FCY)` Currency · `Sub Total (BCY)` Currency · `Debit or Credit` Plain Text · `Customer ID` Number → Customers.Customer ID · `Total (FCY)` Currency · `Total (BCY)` Currency · `Balance (FCY)` Currency · `Balance (BCY)` Currency · `Description` Plain Text · `Created Time` Date · `Last Modified Time` Date

### Vendor Credits Bill — 6 rows
_This table contains the Vendor Credits Bill module data. It contains the information on Items that are used to create a Vendor Credit._
`Bill Credits ID` Number · `Date` Date · `Vendor Credit ID` Number → Vendor Credits.Vendor Credit ID · `Bill ID` Number → Bills.Bill ID · `Amount (BCY)` Currency · `Created Time` Date · `Amount (FCY)` Currency · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Batch Number IN — 5 rows
_This table shows Batch Number details of Zoho Inventory_
`Batch In ID` Number · `Product ID` Number → Items.Item ID · `Batch Number` Plain Text · `Batch Reference#` Plain Text · `Batch Manufactured Date` Date · `Batch Expiry Date` Date · `Quantity In` Decimal Number · `Balance Quantity` Decimal Number · `Warehouse ID` Number → Warehouses.Warehouse ID · `Entity Type` Plain Text · `Account Balance ID` Number · `Account Split ID` Number · `Bill ID` Number → Bills.Bill ID · `Bill Item ID` Number → Bill Item.Item ID · `CreditNotes ID` Number → Credit Notes.CreditNotes ID · `Credit Notes Item ID` Number → Credit Note Items.Item ID · `Inventory Adjustment ID` Number → Inventory Adjustments.Inventory Adjustment ID · `Inventory Adjustment Item ID` Number → Inventory Adjustment Items.Inventory Adjustment Item ID · `Bundle ID` Number → Bundle.Location ID · `Created Time` Date · `Last Modified Time` Date · `Quantity Sold` Decimal Number (formula) · `Purchase Receive ID` Number → Purchase Receive.Purchase Receive ID · `Purchase Receive Item ID` Number → Purchase Receive Items.Item ID · `Sales Return Receive ID` Number → Sales Return Receive.Sales Return Receive ID · `Sales Return Receive Item ID` Number

### Manual Journals — 4 rows
_This table contains Journal data_
`Journal ID` Number · `Journal Number` Plain Text · `Journal Date` Date · `Journal Type` Plain Text · `Status` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Reference` Plain Text · `Notes` Plain Text · `Created Time` Date · `Last Modified Time` Date · `Currency` Plain Text · `Exchange Rate` Decimal Number · `Total (FCY)` Currency · `Total (BCY)` Currency · `Sub Total (FCY)` Currency · `Sub Total (BCY)` Currency · `Location ID` Number → Locations.Location ID

### Recurring Bill Items — 4 rows
_This table contains the Recurring Bill Items module data_
`Item ID` Number · `Recurring Bill ID` Number → Recurring Bills.Recurring Bill ID · `Product ID` Number · `Item Name` Plain Text · `Account ID` Number → Accounts.Account ID · `Quantity` Decimal Number · `Price (BCY)` Currency · `Tax ID` Number → Taxes.Tax ID · `Tax Amount` Currency · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Currency Code` Plain Text · `Product Category` Plain Text · `ITC Eligibility` Plain Text · `HSN/SAC` Plain Text · `Destination Of Supply` Plain Text · `Tax Exemption ID` Number · `Description` Multi Line Text · `Usage unit` Plain Text · `Price (FCY)` Currency · `FCY Tax Amount` Currency · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Last Modified Time` Date · `Created Time` Date

### Recurring Bills — 4 rows
_This table contains the Recurring Bills module data_
`Recurring Bill ID` Number · `Start Date` Date · `End Date` Date · `Recurring Bill Name` Plain Text · `Last Sent Date` Date · `Next Bill Date` Date · `Status` Plain Text · `Recurrence Frequency` Plain Text · `Repeat Every` Number · `Payments Due` Number · `Discount (%)` Percentage · `Vendor ID` Number → Vendors.Vendor ID · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Payment Terms` Number · `Payment Terms Label` Plain Text · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Description` Multi Line Text · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Vendor Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `TDS TaxID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency

### Vendor Credit Items — 4 rows
_This table contains the Vendor Credits Item module data. It contains the information on Vendor Credits that are applied to the Bill._
`Item ID` Number · `Vendor Credit ID` Number → Vendor Credits.Vendor Credit ID · `Product ID` Number → Items.Item ID · `Item Name` Plain Text · `Quantity` Decimal Number · `Item Price (BCY)` Currency · `Tax Amount` Currency · `Total (BCY)` Currency · `Sub Total (BCY)` Currency · `Warehouse ID` Number → Warehouses.Warehouse ID · `Currency Code` Plain Text · `Account ID` Number → Accounts.Account ID · `Item Description` Multi Line Text · `Usage unit` Plain Text · `Item Price (FCY)` Currency · `Product Category` Plain Text · `HSN/SAC` Plain Text · `Destination Of Supply` Plain Text · `Tax Exemption ID` Number · `Tax ID` Number → Taxes.Tax ID · `FCY Tax Amount` Currency · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Last Modified Time` Date · `Created Time` Date · `Project ID` Number → Projects.Project ID · `ITC Eligibility` Plain Text · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency

### Vendor Credits — 4 rows
_This table contains the Vendor Credits module data_
`Vendor Credit ID` Number · `Vendor Credit Date` Date · `Vendor Credit Number` Plain Text · `Vendor Credit Status` Plain Text · `Vendor ID` Number → Vendors.Vendor ID · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Created Time` Date · `Bill ID` Number → Bills.Bill ID · `Balance (BCY)` Currency · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Address ID` Number → Vendor Addresses.Address ID · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Is Inclusive Tax` Yes/No Decision · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Balance (FCY)` Currency · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Reference Number` Plain Text · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `TCS Amount (FCY)` Currency · `TDS TaxID` Number → Taxes.Tax ID · `Withholding Tax (BCY)` Currency · `Withholding Tax (FCY)` Currency

### Credit Note Items — 3 rows
_This table contains the Credit Notes Item module data from Zoho Books, Zoho Invoice, Zoho Subscription and Zoho Expense_
`Item ID` Number · `Item Name` Plain Text · `CreditNotes ID` Number → Credit Notes.CreditNotes ID · `Product ID` Number → Items.Item ID · `Quantity` Decimal Number · `Total` Currency · `Sub Total` Currency · `Warehouse ID` Number → Warehouses.Warehouse ID · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Product Category` Plain Text · `HSN/SAC` Plain Text · `Place Of Supply` Plain Text · `Tax Exemption ID` Number · `Item Price` Currency · `Tax ID` Number → Taxes.Tax ID · `Tax Amount` Currency · `FCY Tax Amount` Currency · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Last Modified Time` Date · `Account` Number → Accounts.Account ID · `Created Time` Date · `Description` Plain Text · `Project ID` Number → Projects.Project ID · `Discount Amount (BCY)` Currency · `Entity Discount Percent` Percentage · `Discount Amount (FCY)` Currency · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency

### Credit Notes — 3 rows
_This table contains the Credit Notes module data from Zoho Books, Invoice, Subscription and Inventory_
`CreditNotes ID` Number · `Credit Note Date` Date · `Credit Note Number` Plain Text · `Credit Note Status` Plain Text · `Customer ID` Number → Customers.Customer ID · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Balance (BCY)` Currency · `Created Time` Date · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Salesperson ID` Number → Salespersons.Salesperson ID · `Last Modified Time` Date · `Discount Amount (BCY)` Currency · `Adjustment (BCY)` Currency · `Invoice ID` Number → Invoices.Invoice ID · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Reason` Plain Text · `Address ID` Number → Customer Addresses.Address ID · `Is Inclusive Tax` Yes/No Decision · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Balance (FCY)` Currency · `Entity Discount Percent` Percentage · `Discount Amount (FCY)` Currency · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Reference Number` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Shipping Charge (FCY)` Currency · `Shipping Charge Tax ID` Number → Taxes.Tax ID · `Shipping Charge Tax Amount (FCY)` Currency · `Shipping Charge (BCY)` Currency · `Shipping Charge Tax Amount (BCY)` Currency · `Adjustment (FCY)` Currency · `TCS Tax ID` Number → Taxes.Tax ID · `TCS Amount (BCY)` Currency · `TCS Amount (FCY)` Currency · `Subject` Multi Line Text · `TDS TaxID` Number → Taxes.Tax ID · `Withholding Tax (BCY)` Currency · `TDS Amount` Currency · `e-Way Bill#` Number · `e-Way Bill Generated Time` Date · `e-Way Bill Status` Plain Text · `e-Way Bill Cancelled Time` Date · `e-Way Bill Expired Time` Date · `Transporter Name` Plain Text · `Transporter ID` Plain Text · `CGST Amount` Currency · `SGST Amount` Currency · `IGST Amount` Currency · `CESS Amount` Currency

### Locations — 3 rows
_Branch Details from Zoho Books._
`Location ID` Number · `Location Name` Plain Text · `Location Status` Plain Text · `GSTIN` Plain Text · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Created Time` Date · `Last Modified Time` Date · `Company Address Street 1` Plain Text · `Company Address Street 2` Plain Text · `City` Plain Text · `State` Plain Text · `Zip Code` Plain Text · `Country` Plain Text · `Phone` Plain Text · `Fax` Plain Text · `Is Primary Location` Yes/No Decision · `Primary Contact Email` Plain Text · `Primary Contact Name` Plain Text · `Location Payroll Status` Plain Text · `Type` Plain Text · `Parent Location ID` Number · `Location Type` Plain Text

### Warehouses — 3 rows
_This table contains the Warehouse module data from Zoho Inventory_
`Warehouse ID` Number · `Warehouse Name` Plain Text · `Address` Plain Text · `City` Plain Text · `State` Plain Text · `Country` Plain Text · `ZIP/Postal Code` Plain Text · `Phone` Plain Text · `Email` Plain Text · `Last Modified Time` Date · `Created Time` Date · `Status` Plain Text

### Attribute — 2 rows
_This table contains the Attribute module data from Zoho Inventory_
`Attribute ID` Number · `Attribute Name` Plain Text · `Created Time` Date · `Last Modified Time` Date

### Attribute Options — 2 rows
_This table contains details on the options that are available for an attribute from Zoho inventory_
`Attribute ID` Number → Attribute.Attribute ID · `Option ID` Number · `Option Name` Plain Text · `Created Time` Date · `Last Modified Time` Date

### Recurring Invoice — 2 rows
_This table contains the Recurring Invoice module data_
`Start Date` Date · `Recurring Invoice ID` Number · `Recurring Invoice Name` Plain Text · `Last Sent Date` Date · `Next Invoice Date` Date · `Status` Plain Text · `Recurrence Frequency` Plain Text · `When` Number · `Payments Due` Number · `Customer ID` Number → Customers.Customer ID · `End Date` Date · `GST Treatment` Plain Text · `GSTIN` Plain Text · `Currency Code` Plain Text · `Exchange Rate` Decimal Number · `Discount Type` Plain Text · `Is Discount Before Tax` Yes/No Decision · `Discount (%)` Percentage · `Is Inclusive Tax` Yes/No Decision · `Source` Plain Text · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Sub Total (FCY)` Currency · `Total (FCY)` Currency · `Balance (FCY)` Currency · `Shipping Charge (BCY)` Currency · `Shipping Charge (FCY)` Currency · `Adjustment (BCY)` Currency · `Adjustment (FCY)` Currency · `Salesperson ID` Number → Salespersons.Salesperson ID · `Payment Terms` Number · `Payment Terms Label` Plain Text · `Notes` Multi Line Text · `Terms & Conditions` Multi Line Text · `Last Modified Time` Date · `Created Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID · `Shipping Charge Tax ID` Number → Taxes.Tax ID · `Shipping Charge Tax Amount (FCY)` Currency · `Shipping Charge Tax Amount (BCY)` Currency · `TDS TaxID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency · `Purchase Order Number` Plain Text · `Business Type` Plain Text

### Recurring Invoice Items — 2 rows
_This table contains the Recurring Invoice Items module data_
`Item ID` Number · `Account` Number → Accounts.Account ID · `Recurring Invoice ID` Number → Recurring Invoice.Recurring Invoice ID · `Product ID` Number → Items.Item ID · `Item Name` Plain Text · `Quantity` Decimal Number · `Item Price` Currency · `Sub Total (BCY)` Currency · `Total (BCY)` Currency · `Last Modified Time` Date · `Created Time` Date · `Currency Code` Plain Text · `Discount Type` Plain Text · `Product Category` Plain Text · `HSN/SAC` Plain Text · `Tax Exemption ID` Number · `Is Discount Before Tax` Yes/No Decision · `Entity Discount Percent` Percentage · `Discount Amount (BCY)` Currency · `Discount Amount (FCY)` Currency · `Is Inclusive Tax` Yes/No Decision · `Tax ID` Number → Taxes.Tax ID · `Tax Amount` Currency · `FCY Tax Amount` Currency · `Source` Plain Text · `Total (FCY)` Currency · `Sub Total (FCY)` Currency · `Description` Plain Text · `Place Of Supply` Plain Text · `Reverse Charge Tax ID` Number → Taxes.Tax ID · `Reverse Charge Tax Amount` Currency · `Reverse Charge Tax Amount (FCY)` Currency · `TDS Tax ID` Number → Taxes.Tax ID · `TDS Amount (BCY)` Currency · `TDS Amount (FCY)` Currency

### Shipping Rate — 2 rows
`Shipping Rate ID` Number · `Shipping Name` Plain Text · `Shipping Zone ID` Number → Shipping Zone.Shipping Zone ID · `Estimated Delivery Time` Plain Text · `Status` Plain Text · `Rate Type` Plain Text · `Based On` Plain Text · `Created Time` Date · `Last Modified Time` Date

### Shipping Rate Value — 2 rows
`Shipping Rate Value ID` Number · `Rate` Decimal Number · `Shipping Rate ID` Number → Shipping Rate.Shipping Rate ID · `Minimum Value` Decimal Number · `Maximum Value` Decimal Number · `Created Time` Date · `Last Modified Time` Date

### Shipping Zone — 2 rows
`Shipping Zone ID` Number · `Title` Plain Text · `Created Time` Date · `Last Modified Time` Date

### Creditnotes Invoice — 1 rows
_This table contains the Credit Notes Invoice module data. It contains the information on Credits Notes applied to the Invoices._
`Creditnotes Invoice ID` Number · `Date` Date · `CreditNotes ID` Number → Credit Notes.CreditNotes ID · `Invoice ID` Number → Invoices.Invoice ID · `Amount (BCY)` Currency · `Created Time` Date · `Amount (FCY)` Currency · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Item Tags — 1 rows
`Tag ID` Number · `Tag Name` Plain Text · `Status` Plain Text · `Created Time` Date · `Last Modified Time` Date

### Item Tags Mapping — 1 rows
`Tag ID` Number → Item Tags.Tag ID · `Product ID` Number → Item Group.Group ID · `Created Time` Date · `Last Modified Time` Date

### Payment Refunds — 1 rows
_This table contains the Customer Payment Refunds data_
`Payment Refund ID` Number · `Payment ID` Number → Customer Payments.Payment ID · `Refund Date` Date · `Refund Mode` Plain Text · `Refund From Account` Number → Accounts.Account ID · `Amount (BCY)` Currency · `Description` Plain Text · `Reference Number` Plain Text · `Amount (FCY)` Currency · `Exchange Rate` Currency · `Created Time` Date · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID

### Vendor Payment Refund — 1 rows
_This table contains the Vendor Payments Refund module data_
`Payment Refund ID` Number · `Payment ID` Number → Vendor Payments.Vendor Payment ID · `Refund Date` Date · `Refund Mode` Plain Text · `Refund From Account` Number → Accounts.Account ID · `Amount (BCY)` Currency · `Description` Plain Text · `Reference Number` Plain Text · `Amount (FCY)` Currency · `Exchange Rate` Currency · `Created Time` Date · `Last Modified Time` Date · `Created By` Number → Users.User ID · `Modified By` Number → Users.User ID
