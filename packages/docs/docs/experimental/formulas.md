# Excel Formula Mode (Formula Cards & Rule Formulas)

<ExperimentalFeatureWarning issueId="5949" />

::::warning
All functionality described here may not be available in the latest stable release. See [Experimental Features](./index.md) for instructions to enable experimental features. Use the `nightly` images for the latest implementation.
::::

Excel formula mode adds two related features:

- **Formula cards**: a dashboard/report card that evaluates an Excel-style formula, including totals from custom queries.
- **Rule formulas**: in the Rules editor, some “set field” actions can be driven by a formula instead of a fixed value.

Under the hood, Actual evaluates formulas using [HyperFormula](https://hyperformula.handsontable.com/). Formulas **must start with `=`**.

## Enable the feature

Go to `Settings -> Show advanced settings -> Experimental features` and enable:

- **Excel formula mode (Formula cards & Rule formulas)**

<img width="609" alt="The Excel formula mode row in the experimental features, with its checkbox ticked" src="/img/experimental/formulas/formulas-enable@2x.webp" />

## Formula cards

### Add a Formula card

1. Go to **Reports**
2. Click **Edit dashboard**
3. Click **Add new widget**
4. Choose **Formula card**

Click the card to open the editor (where you can save the widget).

<img width="189" alt="The Add new widget menu on the Reports dashboard with Formula card highlighted" src="/img/experimental/formulas/formulas-add-card@2x.webp" />

### Write a formula

- **Start with `=`** (example: `=SUM(1, 2, 3)`)
- You can use typical Excel-style functions (autocomplete and hover help are built into the editor).
- The result changes while you type. When the result is a large table (more than 50 rows or 20 columns), the editor stops this, so that a slow query does not run again at each change. Then click **Run** or press **Ctrl+Enter** (**Cmd+Enter** on a Mac) to see the result. When the result is small again, the editor changes the result while you type again. **Save widget** always runs the formula before it saves it.

## Function reference

This list documents formula functions that are useful in Actual. The in-app **autocomplete/hover popover** provides a curated subset of these functions.

:::tip
If a function isn’t listed here, it still might work. Actual uses HyperFormula under the hood, so you can also refer to [HyperFormula’s built-in functions list](https://hyperformula.handsontable.com/guide/built-in-functions.html).
:::

| Function                        | Available in | Description                                                                                                                                                                                                                            | Syntax example                                                                                                                | Optional params                                                                                                 |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ABS`                           | Query, Rules | Returns the absolute value of a number.                                                                                                                                                                                                | `=ABS(-42)`                                                                                                                   | —                                                                                                               |
| `AND`                           | Query, Rules | Returns TRUE if all arguments are TRUE.                                                                                                                                                                                                | `=AND(1=1, 2=2)`                                                                                                              | Accepts more than 2 conditions                                                                                  |
| `AVERAGE`                       | Query        | Returns the average of all numbers in a range.                                                                                                                                                                                         | `=AVERAGE(1, 2, 3)`                                                                                                           | Accepts more than 2 values                                                                                      |
| `AVERAGEA`                      | Query        | Returns the average, including text and logical values.                                                                                                                                                                                | `=AVERAGEA(1, TRUE, "2")`                                                                                                     | Accepts more than 2 values                                                                                      |
| `BALANCE_OF`                    | Query, Rules | Balance for an account; pass a quoted account id or exact account name. In rules, the running balance at this transaction; in reports, the account's current balance.                                                                  | `=BALANCE_OF("550e8400-e29b-41d4-a716-446655440000"); =BALANCE_OF("Checking")`                                                | —                                                                                                               |
| `BUDGET_QUERY`                  | Query        | Returns a budget dimension total for a set of categories over a month range. Dimension is one of: `budgeted`, `spent`, `balance_start`, `balance_end`, `goal`.                                                                         | `=BUDGET_QUERY("spent", QUERY_EXTRACT_CATEGORIES("q"), QUERY_EXTRACT_TIMEFRAME_START("q"), QUERY_EXTRACT_TIMEFRAME_END("q"))` | —                                                                                                               |
| `CEILING`                       | Query, Rules | Rounds up to nearest multiple of significance.                                                                                                                                                                                         | `=CEILING(10.2, 1)`                                                                                                           | —                                                                                                               |
| `CHAR`                          | Query, Rules | Converts number to character.                                                                                                                                                                                                          | `=CHAR(65)`                                                                                                                   | —                                                                                                               |
| `CHOOSE`                        | Query        | Returns value from list based on index.                                                                                                                                                                                                | `=CHOOSE(2, "A", "B", "C")`                                                                                                   | Accepts more than 2 values                                                                                      |
| `CHOOSECOLS`                    | Query, Rules | Returns the columns of a table with the given numbers. A negative number counts from the last column. See [Pick Rows and Columns of a Table](#pick-rows-and-columns-of-a-table).                                                       | `=CHOOSECOLS(Spending, 3)`                                                                                                    | More column numbers                                                                                             |
| `CHOOSEROWS`                    | Query, Rules | Returns the rows of a table with the given numbers. A negative number counts from the last row.                                                                                                                                        | `=CHOOSEROWS(Spending, 1, -1)`                                                                                                | More row numbers                                                                                                |
| `CLEAN`                         | Rules        | Removes non-printable characters from text.                                                                                                                                                                                            | `=CLEAN(notes)`                                                                                                               | —                                                                                                               |
| `CODE`                          | Query, Rules | Returns numeric code for first character.                                                                                                                                                                                              | `=CODE("A")`                                                                                                                  | —                                                                                                               |
| `CONCATENATE`                   | Query, Rules | Combines several text strings into one.                                                                                                                                                                                                | `=CONCATENATE("Paid ", payee_name)`                                                                                           | Accepts more than 2 texts                                                                                       |
| `COS`                           | Query        | Returns the cosine of an angle.                                                                                                                                                                                                        | `=COS(1)`                                                                                                                     | —                                                                                                               |
| `COUNT`                         | Query        | Counts the number of numeric values.                                                                                                                                                                                                   | `=COUNT(1, 2, "x")`                                                                                                           | Accepts more than 2 values                                                                                      |
| `COUNTA`                        | Query        | Counts non-empty values.                                                                                                                                                                                                               | `=COUNTA(1, "", "x")`                                                                                                         | Accepts more than 2 values                                                                                      |
| `COUNTBLANK`                    | Query        | Counts empty cells.                                                                                                                                                                                                                    | `=COUNTBLANK(A1:A10)`                                                                                                         | —                                                                                                               |
| `COUNTIF`                       | Query        | Counts cells that meet a criteria.                                                                                                                                                                                                     | `=COUNTIF(A1:A10, ">0")`                                                                                                      | —                                                                                                               |
| `COUNTIFS`                      | Query        | Counts cells that meet multiple criteria.                                                                                                                                                                                              | `=COUNTIFS(A1:A10, ">0", B1:B10, "<=5")`                                                                                      | Repeat `(range, criteria)` pairs                                                                                |
| `CUMIPMT`                       | Query, Rules | Calculates cumulative interest paid between two periods.                                                                                                                                                                               | `=CUMIPMT(0.05/12, 60, 20000, 1, 12, 0)`                                                                                      | —                                                                                                               |
| `CUMPRINC`                      | Query, Rules | Calculates cumulative principal paid between two periods.                                                                                                                                                                              | `=CUMPRINC(0.05/12, 60, 20000, 1, 12, 0)`                                                                                     | —                                                                                                               |
| `DATE`                          | Query, Rules | Returns date as number of days since null date.                                                                                                                                                                                        | `=DATE(2025, 12, 16)`                                                                                                         | —                                                                                                               |
| `DATEDIF`                       | Query, Rules | Calculates distance between dates.                                                                                                                                                                                                     | `=DATEDIF("2025-01-01", "2025-12-31", "D")`                                                                                   | —                                                                                                               |
| `DATEVALUE`                     | Rules        | Parses a date string and returns it as a number.                                                                                                                                                                                       | `=DATEVALUE("2025-12-16")`                                                                                                    | —                                                                                                               |
| `DAY`                           | Query, Rules | Returns the day from a date.                                                                                                                                                                                                           | `=DAY(date)`                                                                                                                  | —                                                                                                               |
| `DAYS`                          | Query, Rules | Calculates difference between dates in days.                                                                                                                                                                                           | `=DAYS("2025-12-31", "2025-12-01")`                                                                                           | —                                                                                                               |
| `DROP`                          | Query, Rules | Returns a table without its first rows and columns. A negative number removes the last ones.                                                                                                                                           | `=DROP(Spending, 1)`                                                                                                          | Rows and columns                                                                                                |
| `EDATE`                         | Query, Rules | Returns date shifted by specified months.                                                                                                                                                                                              | `=EDATE(date, 1)`                                                                                                             | —                                                                                                               |
| `EOMONTH`                       | Query, Rules | Returns last day of month after specified months.                                                                                                                                                                                      | `=EOMONTH(date, 0)`                                                                                                           | —                                                                                                               |
| `EXACT`                         | Query, Rules | Returns TRUE if texts are exactly the same.                                                                                                                                                                                            | `=EXACT("A", "a")`                                                                                                            | —                                                                                                               |
| `EXP`                           | Query        | Returns e raised to the power of number.                                                                                                                                                                                               | `=EXP(1)`                                                                                                                     | —                                                                                                               |
| `FALSE`                         | Query, Rules | Returns the logical value FALSE.                                                                                                                                                                                                       | `=FALSE()`                                                                                                                    | —                                                                                                               |
| `FILTER`                        | Query, Rules | Returns the rows of a table where the include column is TRUE. A one-row include keeps columns. See [Pick Rows and Columns of a Table](#pick-rows-and-columns-of-a-table).                                                              | `=FILTER(Spending, CHOOSECOLS(Spending, 3) < -100)`                                                                           | Value when no rows match                                                                                        |
| `FIND`                          | Query, Rules | Finds text within text (case-sensitive).                                                                                                                                                                                               | `=FIND("foo", notes)`                                                                                                         | —                                                                                                               |
| `FIXED`                         | Query, Rules | Formats a number to a fixed amount of decimal places.                                                                                                                                                                                  | `=FIXED(1234.5, 2)`                                                                                                           | —                                                                                                               |
| `FLOOR`                         | Query, Rules | Rounds down to nearest multiple of significance.                                                                                                                                                                                       | `=FLOOR(10.8, 1)`                                                                                                             | —                                                                                                               |
| `FORMATCURRENCY`                | Query, Rules | Formats a number as currency using your app currency, number format, symbol position, and spacing settings by default.                                                                                                                 | `=FORMATCURRENCY(1234.5)`                                                                                                     | `symbol`, `decimals`, `thousandsSeparator`, `decimalSeparator`, `symbolPosition`, `spaceBetweenAmountAndSymbol` |
| `FORMATNUMBER`                  | Query, Rules | Formats a number using your app number format settings by default.                                                                                                                                                                     | `=FORMATNUMBER(1234.5, 2)`                                                                                                    | `decimals`, `thousandsSeparator`, `decimalSeparator`                                                            |
| `FV`                            | Query        | Calculates future value of investment.                                                                                                                                                                                                 | `=FV(0.05/12, 12, -100)`                                                                                                      | —                                                                                                               |
| `FVSCHEDULE`                    | Query        | Calculates future value of a principal using a schedule of varying interest rates.                                                                                                                                                     | `=FVSCHEDULE(1000, {0.05;0.06;0.07})`                                                                                         | —                                                                                                               |
| `HLOOKUP`                       | Query        | Searches horizontally in first row and returns value.                                                                                                                                                                                  | `=HLOOKUP("key", A1:D10, 2, TRUE)`                                                                                            | —                                                                                                               |
| `IF`                            | Query, Rules | Returns one value if condition is TRUE, another if FALSE.                                                                                                                                                                              | `=IF(amount<0, "Expense", "Income")`                                                                                          | —                                                                                                               |
| `IFERROR`                       | Query, Rules | Returns value if no error, otherwise returns alternative.                                                                                                                                                                              | `=IFERROR(1/0, 0)`                                                                                                            | —                                                                                                               |
| `IFNA`                          | Query, Rules | Returns value if not #N/A error, otherwise returns alternative.                                                                                                                                                                        | `=IFNA(VLOOKUP("x", A1:B10, 2, FALSE), 0)`                                                                                    | —                                                                                                               |
| `IFS`                           | Query, Rules | Checks multiple conditions and returns corresponding values.                                                                                                                                                                           | `=IFS(amount<0, "Expense", amount>0, "Income")`                                                                               | Repeat `(condition, value)` pairs                                                                               |
| `INDEX`                         | Query        | Returns value at specified row and column.                                                                                                                                                                                             | `=INDEX(A1:C10, 2, 3)`                                                                                                        | —                                                                                                               |
| `INTEGER_TO_AMOUNT`             | Query, Rules | Converts integer amount to decimal amount (e.g., 1234 -> 12.34).                                                                                                                                                                       | `=INTEGER_TO_AMOUNT(1234)`                                                                                                    | `decimal_places` (default: 2)                                                                                   |
| `INT`                           | Rules        | Rounds down to nearest integer.                                                                                                                                                                                                        | `=INT(10.9)`                                                                                                                  | —                                                                                                               |
| `IPMT`                          | Query, Rules | Calculates the interest portion of a loan payment for a given period.                                                                                                                                                                  | `=IPMT(0.05/12, 1, 60, 20000)`                                                                                                | —                                                                                                               |
| `IRR`                           | Query        | Calculates internal rate of return.                                                                                                                                                                                                    | `=IRR(A1:A12)`                                                                                                                | —                                                                                                               |
| `ISEVEN`                        | Rules        | Returns TRUE if number is even.                                                                                                                                                                                                        | `=ISEVEN(10)`                                                                                                                 | —                                                                                                               |
| `ISODD`                         | Rules        | Returns TRUE if number is odd.                                                                                                                                                                                                         | `=ISODD(11)`                                                                                                                  | —                                                                                                               |
| `ISBLANK`                       | Query, Rules | Returns TRUE if value is blank.                                                                                                                                                                                                        | `=ISBLANK(notes)`                                                                                                             | —                                                                                                               |
| `ISERROR`                       | Query, Rules | Returns TRUE if value is any error.                                                                                                                                                                                                    | `=ISERROR(1/0)`                                                                                                               | —                                                                                                               |
| `ISLOGICAL`                     | Query, Rules | Returns TRUE if value is logical (TRUE/FALSE).                                                                                                                                                                                         | `=ISLOGICAL(TRUE())`                                                                                                          | —                                                                                                               |
| `ISNA`                          | Query, Rules | Returns TRUE if value is #N/A error.                                                                                                                                                                                                   | `=ISNA(NA())`                                                                                                                 | —                                                                                                               |
| `ISNUMBER`                      | Query, Rules | Returns TRUE if value is a number.                                                                                                                                                                                                     | `=ISNUMBER(amount)`                                                                                                           | —                                                                                                               |
| `ISOWEEKNUM`                    | Rules        | Returns ISO week number.                                                                                                                                                                                                               | `=ISOWEEKNUM(date)`                                                                                                           | —                                                                                                               |
| `ISREF`                         | Query        | Returns TRUE if value is a reference.                                                                                                                                                                                                  | `=ISREF(A1)`                                                                                                                  | —                                                                                                               |
| `ISTEXT`                        | Query, Rules | Returns TRUE if value is text.                                                                                                                                                                                                         | `=ISTEXT(notes)`                                                                                                              | —                                                                                                               |
| `LEFT`                          | Query, Rules | Returns leftmost characters from text.                                                                                                                                                                                                 | `=LEFT(imported_payee, 10)`                                                                                                   | —                                                                                                               |
| `LEN`                           | Query, Rules | Returns length of text.                                                                                                                                                                                                                | `=LEN(notes)`                                                                                                                 | —                                                                                                               |
| `LN`                            | Query        | Returns the natural logarithm.                                                                                                                                                                                                         | `=LN(10)`                                                                                                                     | —                                                                                                               |
| `LOG`                           | Query        | Returns the logarithm to specified base.                                                                                                                                                                                               | `=LOG(100, 10)`                                                                                                               | —                                                                                                               |
| `LOG10`                         | Query        | Returns the base-10 logarithm.                                                                                                                                                                                                         | `=LOG10(1000)`                                                                                                                | —                                                                                                               |
| `LOOKUP`                        | Query        | Looks up values in a vector or array.                                                                                                                                                                                                  | `=LOOKUP("x", A1:A10)`                                                                                                        | —                                                                                                               |
| `LOWER`                         | Query, Rules | Converts text to lowercase.                                                                                                                                                                                                            | `=LOWER(notes)`                                                                                                               | —                                                                                                               |
| `MATCH`                         | Query        | Returns position of value in array.                                                                                                                                                                                                    | `=MATCH("x", A1:A10, 0)`                                                                                                      | —                                                                                                               |
| `MAX`                           | Query        | Returns the maximum value.                                                                                                                                                                                                             | `=MAX(1, 2, 3)`                                                                                                               | Accepts more than 2 values                                                                                      |
| `MAXA`                          | Query        | Returns the maximum value, including text and logical values.                                                                                                                                                                          | `=MAXA(1, TRUE, "2")`                                                                                                         | Accepts more than 2 values                                                                                      |
| `MEDIAN`                        | Query        | Returns the median value.                                                                                                                                                                                                              | `=MEDIAN(1, 2, 100)`                                                                                                          | Accepts more than 2 values                                                                                      |
| `MID`                           | Query, Rules | Returns substring from specified position.                                                                                                                                                                                             | `=MID(notes, 1, 10)`                                                                                                          | —                                                                                                               |
| `MIN`                           | Query        | Returns the minimum value.                                                                                                                                                                                                             | `=MIN(1, 2, 3)`                                                                                                               | Accepts more than 2 values                                                                                      |
| `MINA`                          | Query        | Returns the minimum value, including text and logical values.                                                                                                                                                                          | `=MINA(1, TRUE, "2")`                                                                                                         | Accepts more than 2 values                                                                                      |
| `MIRR`                          | Query        | Calculates the modified internal rate of return for a series of cash flows.                                                                                                                                                            | `=MIRR(A1:A12, 0.1, 0.12)`                                                                                                    | —                                                                                                               |
| `MOD`                           | Query, Rules | Returns the remainder of division.                                                                                                                                                                                                     | `=MOD(10, 3)`                                                                                                                 | —                                                                                                               |
| `MODE`                          | Query        | Returns the most frequently occurring value.                                                                                                                                                                                           | `=MODE(1, 1, 2)`                                                                                                              | Accepts more than 2 values                                                                                      |
| `MONTH`                         | Query, Rules | Returns the month from a date.                                                                                                                                                                                                         | `=MONTH(date)`                                                                                                                | —                                                                                                               |
| `N`                             | Rules        | Converts value to a number.                                                                                                                                                                                                            | `=N(TRUE())`                                                                                                                  | —                                                                                                               |
| `NETWORKDAYS`                   | Query        | Returns number of working days between dates.                                                                                                                                                                                          | `=NETWORKDAYS("2025-12-01", "2025-12-31")`                                                                                    | —                                                                                                               |
| `NOT`                           | Query, Rules | Reverses the logical value.                                                                                                                                                                                                            | `=NOT(amount<0)`                                                                                                              | —                                                                                                               |
| `NOW`                           | Query, Rules | Returns current date and time.                                                                                                                                                                                                         | `=NOW()`                                                                                                                      | —                                                                                                               |
| `NPER`                          | Query, Rules | Calculates the number of payment periods for a loan or investment.                                                                                                                                                                     | `=NPER(0.05/12, -200, 10000)`                                                                                                 | —                                                                                                               |
| `NPV`                           | Query        | Calculates net present value.                                                                                                                                                                                                          | `=NPV(0.1, -1000, 200, 300)`                                                                                                  | Accepts more than 2 values                                                                                      |
| `OR`                            | Query, Rules | Returns TRUE if any argument is TRUE.                                                                                                                                                                                                  | `=OR(amount<0, amount>0)`                                                                                                     | Accepts more than 2 conditions                                                                                  |
| `PERCENTILE`                    | Query        | Returns the k-th percentile.                                                                                                                                                                                                           | `=PERCENTILE(A1:A100, 0.9)`                                                                                                   | —                                                                                                               |
| `PI`                            | Query        | Returns the value of PI.                                                                                                                                                                                                               | `=PI()`                                                                                                                       | —                                                                                                               |
| `PMT`                           | Query        | Calculates payment for a loan.                                                                                                                                                                                                         | `=PMT(0.05/12, 60, 10000)`                                                                                                    | —                                                                                                               |
| `POWER`                         | Query, Rules | Returns base raised to the power of exponent.                                                                                                                                                                                          | `=POWER(2, 8)`                                                                                                                | —                                                                                                               |
| `PPMT`                          | Query, Rules | Calculates the principal portion of a loan payment for a given period.                                                                                                                                                                 | `=PPMT(0.05/12, 1, 60, 20000)`                                                                                                | —                                                                                                               |
| `PROPER`                        | Query, Rules | Capitalizes first letter of each word.                                                                                                                                                                                                 | `=PROPER(notes)`                                                                                                              | —                                                                                                               |
| `PRODUCT`                       | Query        | Returns the product of all numbers.                                                                                                                                                                                                    | `=PRODUCT(2, 3, 4)`                                                                                                           | Accepts more than 2 values                                                                                      |
| `PV`                            | Query        | Calculates present value of investment.                                                                                                                                                                                                | `=PV(0.05/12, 12, -100)`                                                                                                      | —                                                                                                               |
| `QUARTILE`                      | Query        | Returns the quartile of a dataset.                                                                                                                                                                                                     | `=QUARTILE(A1:A100, 1)`                                                                                                       | —                                                                                                               |
| `QUERY`                         | Query        | Execute a query and return the result.                                                                                                                                                                                                 | `=QUERY("expenses")`                                                                                                          | —                                                                                                               |
| `QUERY_COUNT`                   | Query        | Execute a query and return the number of matching rows.                                                                                                                                                                                | `=QUERY_COUNT("expenses")`                                                                                                    | —                                                                                                               |
| `QUERY_DAYS`                    | Query        | Returns the number of days that a named query includes, with the first and last day counted.                                                                                                                                           | `=QUERY_DAYS("expenses")`                                                                                                     | —                                                                                                               |
| `QUERY_END_DATE`                | Query        | Returns the last day that a named query includes, as `YYYY-MM-DD` text.                                                                                                                                                                | `=QUERY_END_DATE("expenses")`                                                                                                 | —                                                                                                               |
| `QUERY_EXTRACT_CATEGORIES`      | Query        | Determines which categories to include based on a named query's category filters; used as the `categories` argument in `BUDGET_QUERY`.                                                                                                 | `=QUERY_EXTRACT_CATEGORIES("expenses")`                                                                                       | —                                                                                                               |
| `QUERY_EXTRACT_TIMEFRAME_END`   | Query        | Extracts the end month from a named query's date range; used as the `endMonth` argument in `BUDGET_QUERY`.                                                                                                                             | `=QUERY_EXTRACT_TIMEFRAME_END("expenses")`                                                                                    | —                                                                                                               |
| `QUERY_EXTRACT_TIMEFRAME_START` | Query        | Extracts the start month from a named query's date range; used as the `startMonth` argument in `BUDGET_QUERY`.                                                                                                                         | `=QUERY_EXTRACT_TIMEFRAME_START("expenses")`                                                                                  | —                                                                                                               |
| `QUERY_GROUP`                   | Query        | Returns a table with one row for each group of transactions in a named query, with the total amount of each group. See [Group Transactions With `QUERY_GROUP`](#group-transactions-with-query_group).                                  | `=QUERY_GROUP("expenses", "category", , "month")`                                                                             | Sort 1, dimension 2 and sort 2                                                                                  |
| `QUERY_GROUP_COUNT`             | Query        | Returns the same table as `QUERY_GROUP`, with the number of transactions in place of the amount.                                                                                                                                       | `=QUERY_GROUP_COUNT("expenses", "payee")`                                                                                     | Sort 1, dimension 2 and sort 2                                                                                  |
| `QUERY_PIVOT`                   | Query        | Returns a table with one row for each group of one dimension and one column for each group of a second dimension. The first row has the column names. See [Make a Wide Table With `QUERY_PIVOT`](#make-a-wide-table-with-query_pivot). | `=QUERY_PIVOT("expenses", "category", , "month")`                                                                             | Row sort and column sort                                                                                        |
| `QUERY_PIVOT_COUNT`             | Query        | Returns the same table as `QUERY_PIVOT`, with the number of transactions in place of the amount.                                                                                                                                       | `=QUERY_PIVOT_COUNT("expenses", "payee", , "month")`                                                                          | Row sort and column sort                                                                                        |
| `QUERY_START_DATE`              | Query        | Returns the first day that a named query includes, as `YYYY-MM-DD` text.                                                                                                                                                               | `=QUERY_START_DATE("expenses")`                                                                                               | —                                                                                                               |
| `QUERY_TABLE`                   | Query        | Returns the rows of a named AQL query that has `select` or `groupBy`, with one column for each `select` item. See [Get the Rows of a Table Query](#get-the-rows-of-a-table-query).                                                     | `=QUERY_TABLE("spendByPayee", TRUE())`                                                                                        | Header                                                                                                          |
| `RANK`                          | Query        | Returns the rank of a number in a list.                                                                                                                                                                                                | `=RANK(10, A1:A10, 0)`                                                                                                        | —                                                                                                               |
| `RATE`                          | Query        | Calculates interest rate per period.                                                                                                                                                                                                   | `=RATE(60, -200, 10000)`                                                                                                      | —                                                                                                               |
| `REPLACE`                       | Query, Rules | Replaces substring at specified position.                                                                                                                                                                                              | `=REPLACE(notes, 1, 5, "")`                                                                                                   | —                                                                                                               |
| `REPT`                          | Query, Rules | Repeats text specified number of times.                                                                                                                                                                                                | `=REPT("*", 10)`                                                                                                              | —                                                                                                               |
| `RIGHT`                         | Query, Rules | Returns rightmost characters from text.                                                                                                                                                                                                | `=RIGHT(imported_payee, 4)`                                                                                                   | —                                                                                                               |
| `ROUND`                         | Query, Rules | Rounds a number to specified decimals.                                                                                                                                                                                                 | `=ROUND(amount, 2)`                                                                                                           | —                                                                                                               |
| `ROUNDDOWN`                     | Query, Rules | Rounds down to specified decimals.                                                                                                                                                                                                     | `=ROUNDDOWN(amount, 0)`                                                                                                       | —                                                                                                               |
| `ROUNDUP`                       | Query, Rules | Rounds up to specified decimals.                                                                                                                                                                                                       | `=ROUNDUP(amount, 0)`                                                                                                         | —                                                                                                               |
| `SEARCH`                        | Query, Rules | Finds text within text (case-insensitive, supports wildcards).                                                                                                                                                                         | `=SEARCH("foo", notes)`                                                                                                       | —                                                                                                               |
| `SIGN`                          | Rules        | Returns -1 for negative, 0 for zero, 1 for positive.                                                                                                                                                                                   | `=SIGN(amount)`                                                                                                               | —                                                                                                               |
| `SIN`                           | Query        | Returns the sine of an angle.                                                                                                                                                                                                          | `=SIN(1)`                                                                                                                     | —                                                                                                               |
| `SPLIT`                         | Rules        | Splits text by space and returns part at index.                                                                                                                                                                                        | `=SPLIT(imported_payee, 0)`                                                                                                   | —                                                                                                               |
| `SQRT`                          | Query, Rules | Returns the square root.                                                                                                                                                                                                               | `=SQRT(9)`                                                                                                                    | —                                                                                                               |
| `STDEV`                         | Query        | Returns the standard deviation of a sample.                                                                                                                                                                                            | `=STDEV(A1:A10)`                                                                                                              | —                                                                                                               |
| `STDEVP`                        | Query        | Returns the standard deviation of a population.                                                                                                                                                                                        | `=STDEVP(A1:A10)`                                                                                                             | —                                                                                                               |
| `SUBSTITUTE`                    | Query, Rules | Replaces occurrences of text.                                                                                                                                                                                                          | `=SUBSTITUTE(imported_payee, " 12345", "")`                                                                                   | —                                                                                                               |
| `SUM`                           | Query, Rules | Returns the sum of all numbers in a range.                                                                                                                                                                                             | `=SUM(1, 2, 3)`                                                                                                               | Accepts more than 2 values                                                                                      |
| `SUMIF`                         | Query        | Sums cells that meet a criteria.                                                                                                                                                                                                       | `=SUMIF(A1:A10, ">0", B1:B10)`                                                                                                | —                                                                                                               |
| `SUMIFS`                        | Query        | Sums cells that meet multiple criteria.                                                                                                                                                                                                | `=SUMIFS(B1:B10, A1:A10, ">0", C1:C10, "X")`                                                                                  | Repeat `(range, criteria)` pairs                                                                                |
| `SUMPRODUCT`                    | Query        | Multiplies corresponding elements and returns the sum.                                                                                                                                                                                 | `=SUMPRODUCT(A1:A10, B1:B10)`                                                                                                 | Accepts more arrays                                                                                             |
| `SUMSQ`                         | Query        | Returns the sum of the squares.                                                                                                                                                                                                        | `=SUMSQ(1, 2, 3)`                                                                                                             | Accepts more than 2 values                                                                                      |
| `SWITCH`                        | Query, Rules | Matches expression against values and returns corresponding result.                                                                                                                                                                    | `=SWITCH(category_name, "Groceries", "Food", "Fuel", "Transport")`                                                            | Repeat `(value, result)` pairs; default supported                                                               |
| `T`                             | Rules        | Returns text if value is text, empty string otherwise.                                                                                                                                                                                 | `=T(notes)`                                                                                                                   | —                                                                                                               |
| `TAKE`                          | Query, Rules | Returns the first rows and columns of a table. A negative number gives the last ones.                                                                                                                                                  | `=TAKE(Spending, 5)`                                                                                                          | Rows and columns                                                                                                |
| `TAN`                           | Query        | Returns the tangent of an angle.                                                                                                                                                                                                       | `=TAN(1)`                                                                                                                     | —                                                                                                               |
| `TEXT`                          | Query, Rules | Converts number to text with format.                                                                                                                                                                                                   | `=TEXT(date, "MMMM yyyy")`                                                                                                    | —                                                                                                               |
| `TODAY`                         | Query, Rules | Returns current date.                                                                                                                                                                                                                  | `=TODAY()`                                                                                                                    | —                                                                                                               |
| `TRIM`                          | Query, Rules | Removes extra spaces from text.                                                                                                                                                                                                        | `=TRIM(notes)`                                                                                                                | —                                                                                                               |
| `TRUNC`                         | Rules        | Truncates number to specified decimals.                                                                                                                                                                                                | `=TRUNC(amount, 0)`                                                                                                           | —                                                                                                               |
| `TRUE`                          | Query, Rules | Returns the logical value TRUE.                                                                                                                                                                                                        | `=TRUE()`                                                                                                                     | —                                                                                                               |
| `UPPER`                         | Query, Rules | Converts text to uppercase.                                                                                                                                                                                                            | `=UPPER(notes)`                                                                                                               | —                                                                                                               |
| `VALUE`                         | Rules        | Converts text to a number.                                                                                                                                                                                                             | `=VALUE("123.45")`                                                                                                            | —                                                                                                               |
| `VAR`                           | Query        | Returns the variance of a sample.                                                                                                                                                                                                      | `=VAR(A1:A10)`                                                                                                                | —                                                                                                               |
| `VARP`                          | Query        | Returns the variance of a population.                                                                                                                                                                                                  | `=VARP(A1:A10)`                                                                                                               | —                                                                                                               |
| `VLOOKUP`                       | Query        | Searches vertically in first column and returns value.                                                                                                                                                                                 | `=VLOOKUP("key", A1:D10, 2, TRUE)`                                                                                            | —                                                                                                               |
| `WEEKDAY`                       | Query, Rules | Returns day of week (1-7).                                                                                                                                                                                                             | `=WEEKDAY(date, 1)`                                                                                                           | —                                                                                                               |
| `WEEKNUM`                       | Query, Rules | Returns week number of year.                                                                                                                                                                                                           | `=WEEKNUM(date, 1)`                                                                                                           | —                                                                                                               |
| `XNPV`                          | Query        | Calculates net present value for cash flows on irregular (dated) intervals.                                                                                                                                                            | `=XNPV(0.1, A1:A5, B1:B5)`                                                                                                    | —                                                                                                               |
| `XOR`                           | Query, Rules | Returns TRUE if odd number of arguments are TRUE.                                                                                                                                                                                      | `=XOR(TRUE(), FALSE())`                                                                                                       | Accepts more than 2 conditions                                                                                  |
| `YEAR`                          | Query, Rules | Returns the year from a date.                                                                                                                                                                                                          | `=YEAR(date)`                                                                                                                 | —                                                                                                               |

### Formatting numbers and currency

`FORMATNUMBER` and `FORMATCURRENCY` use your app formatting preferences when optional arguments are omitted.

```text
=FORMATNUMBER(1234.5, 2)
=FORMATCURRENCY(1234.5)
```

You can override separators and currency display for a single formula:

```text
=FORMATCURRENCY(1234.5, "€", 2, ".", ",", "after", TRUE())
```

The `symbolPosition` argument accepts `"before"` or `"after"`. The `spaceBetweenAmountAndSymbol` argument accepts `TRUE()` or `FALSE()`.

### Use queries with `QUERY("name")` and `QUERY_COUNT("name")`

Formula cards can reference **named queries** that you define in the right-side panel (**Query Definitions**).

- `QUERY("myQuery")` returns the **sum of transaction amounts** for that query’s filters and date range (returned in normal “money” units, e.g. `-123.45`).
- If no query has that name, the card shows an error that names the missing query. The card does not show a value until you fix the name or add the query.

Example:

```text
=QUERY("income") - QUERY("expenses")
```

### Get the Days of a Query

Three functions give the days that a query includes. They use the same days as the query filter.

- `QUERY_START_DATE("myQuery")` gives the first day, as text in the form `YYYY-MM-DD`.
- `QUERY_END_DATE("myQuery")` gives the last day, in the same form.
- `QUERY_DAYS("myQuery")` gives the number of days, with the first and the last day counted.

A date range in months includes all of each month. For example, a query for this month ends on the last day of the month, also when that day is in the future.

If the query has no date range, `QUERY_START_DATE` and `QUERY_END_DATE` give empty text, and `QUERY_DAYS` gives an error.

This example gives the average amount for each day of the query:

```text
=QUERY("expenses") / QUERY_DAYS("expenses")
```

Formulas can also subtract one date from the other. `=QUERY_END_DATE("expenses") - QUERY_START_DATE("expenses") + 1` gives the same value as `QUERY_DAYS("expenses")`.

### Group Transactions With `QUERY_GROUP`

`QUERY_GROUP` gives a table with one row for each group of transactions in a query. A formula card shows it in the [table view](#show-a-table).

```text
=QUERY_GROUP("query", "dimension 1", "sort 1", "dimension 2", "sort 2")
```

- **query**: the name of a query.
- **dimension 1**: how to put the transactions into groups. Use one of `category`, `category_group`, `payee`, `account`, `day`, `week`, `month`, `quarter` or `year`.
- **sort 1** (optional): the order of the rows.
  - `budget` (the default): categories and category groups in the order of your budget, accounts in the order of the sidebar, payees by name, and periods by date.
  - `name`: by name, from A to Z. Periods stay in date order.
  - `asc` or `desc`: by amount, from the smallest or from the largest. With two dimensions, the order uses the total of each dimension 1 group, so that the rows of a group stay together.
- **dimension 2** (optional): a second dimension. Each row then has one group of dimension 1 and one group of dimension 2.
- **sort 2** (optional): the order of the rows in each dimension 1 group. Use `budget`, `name`, `asc` or `desc`. Without sort 2, `name` sorts both dimensions by name, and `asc` and `desc` also sort the rows in each group by amount. But a period dimension 2 stays in date order. With sort 2 set to `asc` or `desc`, periods also sort by amount.

Each row has the name of each group, then the total amount. `QUERY_GROUP_COUNT` takes the same arguments and gives the number of transactions in place of the amount.

This example gives the spending for each category, with the largest spending first. Spending amounts are negative, so `asc` puts them first:

```text
=QUERY_GROUP("expenses", "category", "asc")
```

To use the default sort with dimension 2, leave the place of the sort empty, for example `=QUERY_GROUP("expenses", "month", , "category")`.

This example shows the category groups with the largest spending first, and the categories of each group from A to Z:

```text
=QUERY_GROUP("expenses", "category group", "asc", "category", "name")
```

Some things to know:

- Transactions without a category go in an **Uncategorized** row. This row also has transfers and the transactions of off-budget accounts, if the query does not filter them out. Transactions without a payee go in a **No payee** row.
- A transfer payee gets the name of its account.
- A period dimension (`day`, `week`, `month`, `quarter` or `year`) gives a row for each period of the query date range, also for a period without transactions. If the query has no date range, the rows go from the first to the last period with transactions.
- A week has the date of its first day, for example `2024-01-07`. The **First day of the week** setting on the **Settings** page gives the first day of a week. A quarter has a name such as `Q1 '24`.
- The editor shows a warning for a table with more than 50 rows, or with more than 20 columns. A table that large is hard to read on a card. The card does not show this warning.
- A query without transactions gives one row with empty names and 0.
- The arguments must be text in the formula, for example `"category"`. A cell reference or a function does not work here.

`QUERY_GROUP` gives a table, so other functions can use it. For example, `=INDEX(QUERY_GROUP("expenses", "category"), 1, 2)` gives the amount in row 1, and `=SUM(QUERY_GROUP_COUNT("expenses", "category"))` gives the number of transactions.

#### Make a Wide Table With `QUERY_PIVOT`

`QUERY_PIVOT` gives the same totals as `QUERY_GROUP` with two dimensions, but in a wide table. Each group of the first dimension gets a row, and each group of the second dimension gets a column.

```text
=QUERY_PIVOT("query", "rows", "row sort", "columns", "column sort")
```

- **query**: the name of a query.
- **rows**: the dimension for the rows. Use one of the `QUERY_GROUP` dimensions.
- **row sort** (optional): the order of the rows. `budget`, `name`, `asc` and `desc` work as for `QUERY_GROUP`. `asc` and `desc` use the total of each row.
- **columns**: the dimension for the columns. It must be different from **rows**.
- **column sort** (optional): the order of the columns. `asc` and `desc` use the total of each column, also for periods. Without a column sort, the columns stay in budget order, or in name order when the row sort is `name`.

This example gives the spending of each category, with one column for each month:

```text
=QUERY_PIVOT("expenses", "category", , "month")
```

The first row has the names of the columns, for example the months. The first cell of this row has the name of the first dimension, for example `Category`. A cell without transactions shows 0. `QUERY_PIVOT_COUNT` takes the same arguments and gives the number of transactions in place of the amount.

The card shows the first row as the header row of the table. A month in the header row shows as the short month name and year, for example `Jan '24`. A day or a week shows in your date format. To give a column a different name, type it under **Columns**.

With the header row in the table, `INDEX` counts it as row 1. For example, `=INDEX(QUERY_PIVOT("expenses", "category", , "month"), 2, 2)` gives the amount of the first category in the first month.

### Pick Rows and Columns of a Table

These functions take a table, for example from `QUERY_GROUP` or from a [named formula](#reuse-a-formula-with-named-formulas), and give a part of it:

- `CHOOSECOLS(table, 3)` gives column 3. `CHOOSECOLS(table, 1, 3)` gives columns 1 and 3. A negative number counts from the end, so `-1` is the last column.
- `CHOOSEROWS(table, 1, 2)` gives rows 1 and 2, in the same way.
- `TAKE(table, 5)` gives the first 5 rows, and `TAKE(table, -5)` gives the last 5 rows. A third argument gives a number of columns, for example `TAKE(table, , 2)` for the first 2 columns.
- `DROP(table, 1)` gives the table without its first row. A negative number removes rows from the end.
- `FILTER(table, include)` gives the rows where **include** is TRUE. **include** must be one column with one value for each row of the table. If **include** is one row with one value for each column, `FILTER` keeps those columns.

This example gives the categories with spending of more than 100. The amount is in column 3, and spending amounts are negative:

```text
=FILTER(QUERY_GROUP("expenses", "category group", , "category"), CHOOSECOLS(QUERY_GROUP("expenses", "category group", , "category"), 3) < -100)
```

With a named formula `Spending` that has the `QUERY_GROUP` formula, the same formula is shorter:

```text
=FILTER(Spending, CHOOSECOLS(Spending, 3) < -100)
```

To use more than one condition, put each one in parentheses. Multiply them for "and", and add them for "or". For example, `=FILTER(Spending, (CHOOSECOLS(Spending, 3) < -100) * (CHOOSECOLS(Spending, 1) = "Bills"))` gives the rows of the Bills group with spending of more than 100.

If no rows match, `FILTER` gives the error `#N/A`. To show a value in its place, give it as the third argument, for example `=FILTER(Spending, CHOOSECOLS(Spending, 3) < -1000, "None")`.

`FILTER` works as in Excel. It replaces the HyperFormula `FILTER`, which takes only one row or one column. The HyperFormula version also takes more than one include argument. In this version, the third argument is the value when no rows match, so multiply the conditions in its place.

### Account balances with `BALANCE_OF("name")`

Formula cards can also reference an account's **current balance** directly, without setting up a named query:

- `BALANCE_OF("Checking")` returns the account's current balance, in normal "money" units (e.g. `-123.45`), the same as `QUERY()`.
- Pass a **quoted account id** for a deterministic match, or a **quoted account name** for an exact name match.
- If no account matches, the card shows an error that names the missing account.

Example:

```text
=BALANCE_OF("Checking") + BALANCE_OF("Savings")
```

:::tip
In rule formulas, `BALANCE_OF` instead returns the running balance **at a specific transaction** — see [Rule formulas](#rule-formulas) below.
:::

### Define a query

In the Formula editor page, use **Query Definitions**:

1. **Add Query** and give it a name (the name is what you reference in `QUERY("...")`)
2. Set the date range. The menu next to the dates has these options:
   - **Live**: keeps the range moving (e.g. “last 3 months”)
   - **Static**: fixed start/end dates
   - A range from the date picker, for example **Year to date**, also shows in the menu.
3. Add **Filters** (same style as report filters)

<img width="1196" alt="The formula editor with two named queries in the Query Definitions panel, numbered by step" src="/img/experimental/formulas/formulas-editor-and-queries@2x.webp" />

### Share Queries With the Formula Library

A query that you define on a card works only on that card. To use the same query on many cards, add it to the **Formula library**. Every formula card can then use it with `QUERY("name")`, `QUERY_COUNT("name")` and the `QUERY_EXTRACT_*` functions.

To open the formula library, go to **Settings** > **Formula library**. This page shows only when Excel formula mode is on.

:::note
The formula library is available on desktop only.
:::

To add a query to the library:

1. Select **Create new query**.
2. Type a name. Names are not case-sensitive, so `Food` and `food` are the same name. Two library queries cannot have the same name.
3. Optionally, type a description.
4. Set the date range and the filters, the same as for a query on a card.
5. Select **Save**.

The **Used by** column shows how many cards use each query. Select it to see the cards and their formulas.

#### Use Library Queries in the Card Editor

In the formula editor, the formula autocomplete shows the library queries together with the queries of the card.

To see the library queries, turn on **Show library queries** under **Query Definitions**. If the card formula uses a library query when you open the editor, this option is already on. Each library query has these buttons:

- **Edit** opens the library query. A change applies to every card that uses the query.
- **Copy into card** adds a copy of the query to the card. The copy has the same name, so the card uses its copy and not the library query. Use this to change the query for one card only.

Each library query also has a time frame menu. The menu starts at **Library**, which means that the card uses the time frame of the library query. To give the card its own time frame for the query, select **Live** or **Static** in the menu, or select a date range. The filters stay the same as in the library. To go back to the time frame of the library query, select **Library** in the menu.

To move a query from a card to the library, select **Make shared** on the card query. Actual adds the query to the library and removes it from the card. Then select **Save widget**. **Make shared** is not available when the library already has a query with the same name.

#### Rename a Library Query

When you rename a query that cards use, Actual shows a list of these cards, and each card is selected. Actual changes the query name in the formulas of the selected cards. A card that you clear keeps the old name, and shows an error until you change its formula or add a query with the old name.

To reverse a rename and the formula changes that it made, use undo once.

Actual also changes the query name in every named formula that uses the query. The list shows these named formulas too.

Actual cannot change a name that a formula builds from parts, for example `QUERY("fo" & "od")`. The list of cards does not show these formulas.

#### Delete a Library Query

Before Actual deletes a query, it shows the cards that use it. After the delete, these cards show an error until you change their formulas or add a query with the same name.

#### When Two Queries Have the Same Name

- If a card has its own query with the same name as a library query, the card uses its own query.
- If two library queries have the same name, formulas use the older query. This can happen when two devices sync. The formula library shows a note on the newer query.

In both cases, the card shows a warning line at the bottom.

A card time frame stays with its library query, also after a rename. If a different library query gets the name later, the card does not use the card time frame, and shows a warning line.

#### Export and Import a Dashboard

When you export a dashboard, the file also holds the library queries and the library named formulas that its formula cards use. The card named formulas are part of their cards. When you import the file, Actual does one of these for each library query in the file:

- If your formula library has a query with the same name, filters, and time frame, the cards use your query.
- If your formula library has a different query with the same name, each card that uses the name gets a copy of the query from the file. The card query has priority over the library query, so the card shows the same result as before the export.
- If your formula library has no query with the name, Actual adds the query to your formula library.

An [AQL query](#write-queries-in-actualql) in the file works the same, with one difference. If your formula library has a different query with the same name, Actual adds the AQL query from the file with a new name, for example `coffee_2`. Actual changes the name in the imported cards and named formulas, so the cards show the same result as before the export.

For each named formula in the file, Actual does one of these:

- If your formula library has a named formula with the same name and formula, the cards use your named formula.
- If your formula library has a different named formula with the same name, Actual adds the named formula from the file with a new name, for example `NetIncome_2`. Actual changes the name in the imported cards and named formulas, so the cards show the same result as before the export.
- If your formula library has no named formula with the name, Actual adds the named formula to your formula library.

The import does not change or delete the queries and named formulas that are already in your formula library. A card time frame for a library query stays with its query.

### Write Queries in ActualQL

An AQL query is a library query that you write in ActualQL, the query language of the [Actual API](../api/actual-ql/index.md). It can do things that the filters of a query cannot do, for example:

- Join "and" and "or" in one query, for example "Kroger transactions under $50, or any bill".
- Match text with a regular expression (`$regexp`) or with a pattern (`$like`).
- Read the fields of a linked record, for example `payee.name` or `category.group.name`.
- Read other tables: accounts, payees, categories, category groups, schedules and the budget tables.

To add an AQL query:

1. Go to **Settings** > **Formula library**.
2. Under **AQL queries**, select **Create new AQL query**.
3. Type a name. AQL queries and the other library queries share one set of names, so an AQL query cannot have the name of a library query.
4. Type the query in the **Query** box. The line under the box shows the kind of the query, or the error in the text.
5. Optionally, set the date field and the time frame. For a table query, you can also set the money columns and the row limit.
6. Look at **Result**. It updates when you stop typing.
7. Select **Save**.

A card uses an AQL query by its name, as for the other library queries, for example `QUERY("groceries")` or `QUERY_TABLE("spendByPayee")`. In the card editor, AQL queries show with the library queries.

#### Write the Query

Write the query as JSON, with one key for each method of an ActualQL query: `table`, `filter`, `options`, `groupBy`, `select`, `orderBy`, `calculate`, `limit` and `offset`. For example, this query is the same as `q('transactions').filter({ 'payee.name': { $oneof: ['Kroger', 'Publix'] } })`:

```json
{
  "table": "transactions",
  "filter": { "payee.name": { "$oneof": ["Kroger", "Publix"] } }
}
```

A `filter` can also be a list of objects. A transaction must then match all of them.

The query can read only these tables: `transactions`, `accounts`, `payees`, `categories`, `category_groups`, `schedules`, `zero_budgets` and `reflect_budgets`. A query never reads deleted records.

#### Kinds of AQL Query

The JSON gives one of three kinds of query:

| Kind   | The query has                                                                            | Use it in                                                                                       |
| ------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Filter | `"table": "transactions"`, with only `filter` and `options`                              | `QUERY`, `QUERY_COUNT`, `QUERY_GROUP`, `QUERY_PIVOT`, `QUERY_DAYS` and the other date functions |
| Value  | `calculate`                                                                              | `QUERY`                                                                                         |
| Table  | `select`, `groupBy`, `orderBy`, `limit` or `offset`, or a table that is not transactions | `QUERY_TABLE`                                                                                   |

A filter AQL query works the same as a library query with filters. For example, `QUERY("groceries")` gives the sum of the amounts, and `QUERY_GROUP("groceries", "payee")` gives a row for each payee.

A value query gives the value of its `calculate`. Actual reads the value as an amount, the same as the amounts of transactions, unless the calculation is `$count`. If the value is a count of a different kind, select **The value is a count, not an amount**.

`QUERY_EXTRACT_CATEGORIES`, `QUERY_EXTRACT_TIMEFRAME_START` and `QUERY_EXTRACT_TIMEFRAME_END` do not work with an AQL query.

#### Get the Rows of a Table Query

`QUERY_TABLE` gives the rows of a table query:

```
=QUERY_TABLE("query", header)
```

The table has one column for each item of `select`, in the same order. For example, with this query named `spendByPayee`, `=QUERY_TABLE("spendByPayee")` gives one row for each payee, with the payee name, the total and the number of transactions:

```json
{
  "table": "transactions",
  "filter": { "amount": { "$lt": 0 } },
  "groupBy": ["payee.name"],
  "select": [
    "payee.name",
    { "total": { "$sum": "$amount" } },
    { "count": { "$count": "$id" } }
  ],
  "orderBy": [{ "$sum": "$amount", "$dir": "asc" }]
}
```

The table has no header row, so other functions can use its values. For example, `=SUM(CHOOSECOLS(QUERY_TABLE("spendByPayee"), 2))` gives the total of all payees. To add the column names as the first row, set `header` to `TRUE()`: `=QUERY_TABLE("spendByPayee", TRUE())`. The names are the `select` items, for example `payee.name` and `total`.

The query name and `header` must be in the formula, not in a cell or a named formula. Actual must know the size of the table before the formula runs.

The database stores an amount in cents. A money column gives the amount, as `QUERY` does. Under **Money columns** in the AQL query editor, select the columns that are money. By default, a column is money when its expression reads a field named `amount`, for example `{"total": {"$sum": "$amount"}}`. If the `select` has a `*`, the fields named `amount` are money.

A table query gives at most 1,000 rows. If the query gives more rows, the table stops at 1,000 rows, and the card shows a warning. To get fewer rows, add a filter or a `limit` to the query. To get more rows, set **Row limit**, up to 10,000. A smaller `limit` in the query is used instead, with no warning.

On a card, the [table view](#show-a-table) shows a column of numbers as money. To show a count as a number, set the type of its column to **Number**.

#### Set the Time Frame of an AQL Query

The time frame filters a date field. A transactions query uses `date`, and a schedules query can use `next_date`. Queries of the other tables have no time frame. To turn off the time frame, set **Date field for the time frame** to **None**.

The time frame starts at **All time**. A card can give the query its own time frame, as for the other library queries. If the query has no date field, the card time frame does not apply, and the card shows a warning line.

#### Tips for AQL Queries

- A linked field such as `category` or `payee` gives an id. To get the name, use `category.name` or `payee.name`. The result in the editor shows a hint when a column has only ids.
- ActualQL cannot order rows by a name from `select`. To order by a sum, repeat the sum in `orderBy`, with the direction in `$dir`: `"orderBy": [{"$sum": "$amount", "$dir": "desc"}]`.
- If the query has an error, for example a field name that does not exist, the card shows the error. The other parts of Actual do not show it.

### Reuse a Formula With Named Formulas

A named formula is a formula with a name. A card formula uses a named formula by its name, with no quotes. For example, the named formula `NetIncome` has the formula `=QUERY("income") + QUERY("expenses")`. This card formula then gives the average for each month of a year:

```text
=NetIncome / 12
```

There are two types of named formula:

- A library named formula is in the formula library. Every card can use it.
- A card named formula is on one card only. Other cards cannot use it.

A named formula can use queries, functions, and other named formulas. A named formula cannot use itself, also not through other named formulas. Named formulas are available in formula cards only, not in rule formulas.

A named formula can give one value or a table. A formula uses a named formula that gives a table as it uses a table from a function. For example, the named formula `Spending` has the formula `=QUERY_GROUP("expenses", "category")`. Then `=INDEX(Spending, 1, 2)` gives the amount in row 1, `=SUM(Spending)` gives the total, and `=SORT(Spending, 2, 1)` gives the table sorted by amount. If the card formula is `=Spending`, the card shows the table. Under **Named formulas** in the card editor, each named formula shows the first 10 rows of its table.

To add a library named formula:

1. Go to **Settings** > **Formula library**.
2. Under **Named formulas**, select **Create new named formula**.
3. Type a name. Names are not case-sensitive, so `NetIncome` and `netincome` are the same name.
4. Optionally, type a description.
5. Type the formula. The formula must start with `=`. **Result** shows the value or the table that the formula gives. As in the card editor, a large table stops the result from changing while you type. Then click **Run** or press **Ctrl+Enter** to see the result.
6. Select **Save**.

A named formula name can have letters, digits, `_` and `.`. It must start with a letter or `_`. A name cannot look like a cell reference, for example `AB12`. Formulas use `RESULT`, `TRUE`, `FALSE` and names that start with `theme_` for other things, so a named formula cannot have these names.

#### How a Named Formula Uses Queries

A named formula uses the queries of the card that uses it:

- If the card has its own query with the same name as a library query, the named formula uses the card query.
- If the card has its own time frame for a library query, the named formula uses that time frame.

Thus one library named formula can give a different value on each card. **Result** in the library named formula editor has no card, so it uses the library queries only.

#### Add a Card Named Formula

1. In the card editor, under **Named formulas**, select **Add Named Formula**.
2. Type a name and the formula. Optionally, type a description.
3. Select **Save**. **Result** shows the value of the formula on this card.
4. Select **Save widget**. Until you save the widget, the card named formula is not stored.

If a card named formula has the same name as a library named formula, the card uses the card named formula. This is also true when a library named formula uses the name. For example, the library named formula `Yearly` has the formula `=NetIncome * 12`. On a card with a card named formula `NetIncome`, `Yearly` uses the card named formula. The card shows a warning that the card named formula hides the library named formula.

#### Use Named Formulas in the Card Editor

The formula autocomplete shows the card named formulas and the library named formulas in their own section.

The card named formulas are under **Named formulas**. Each card named formula shows its formula and its value or table on this card, and has these buttons:

- **Insert** adds the named formula name to the card formula, at the cursor.
- **Make shared** moves the named formula to the formula library. Then select **Save widget**. **Make shared** is not available when the library already has a named formula with the same name. If the named formula uses a card query or another card named formula, Actual does not move it, and shows the names that it uses. A library named formula cannot find these names, so make them shared first.
- **Edit** opens the named formula. When you rename a card named formula, Actual also changes the name in the formulas of the card and in its other card named formulas.
- The delete button removes the named formula from the card.

To see the library named formulas, turn on **Show library named formulas**. If the card formula uses a library named formula when you open the editor, this option is already on. Each library named formula shows its formula and its value on this card, and has these buttons:

- **Insert** adds the named formula name to the card formula, at the cursor.
- **Copy into card** adds a copy of the named formula to the card as a card named formula. The copy has the same name, so the card uses its copy. Use this to change the named formula for one card only.
- **Edit** opens the library named formula. A change applies to every card that uses the named formula.

#### Rename or Delete a Library Named Formula

When you rename a library named formula that cards use, Actual shows a list of these cards, and each card is selected. Actual changes the named formula name in the formulas and the card named formulas of the selected cards. Actual also changes the name in every library named formula that uses the renamed named formula. A card that you clear keeps the old name, and shows an error until you change its formula or add a named formula with the old name. A card with a card named formula of the same name does not use the library named formula, so it does not change.

Before Actual deletes a library named formula, it shows the cards and the named formulas that use it. After the delete, these cards show the error `Named formula "name" not found`.

#### Named Formula Errors

- If the formula of a named formula gives an error, for example a division by zero, the card shows which named formula gives the error.
- If two library named formulas have the same name, formulas use the older named formula. This can happen when two devices sync. The card shows a warning line at the bottom.

### Budget queries with `BUDGET_QUERY`

`BUDGET_QUERY` reads directly from your **envelope budget** (budgeted amounts, spending, balances, and goals) for a fixed set of categories over a month range.

Syntax:

```text
=BUDGET_QUERY("dimension", categories, startMonth, endMonth)
```

| Parameter    | Description                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dimension`  | What to return. One of: `budgeted`, `spent`, `balance_start`, `balance_end`, `goal`                                                                                                                                                          |
| `categories` | Which categories to include — use `QUERY_EXTRACT_CATEGORIES("queryName")` to pull from a named query's filters. Advanced: a literal array of category IDs (`{"id1";"id2"}`) is also accepted, but using the extract function is recommended. |
| `startMonth` | Start month in `YYYY-MM` format, or `QUERY_EXTRACT_TIMEFRAME_START("queryName")`                                                                                                                                                             |
| `endMonth`   | End month in `YYYY-MM` format, or `QUERY_EXTRACT_TIMEFRAME_END("queryName")`                                                                                                                                                                 |

The result is in normal "money" units (e.g. `-123.45`), the same as `QUERY()`.

**Dimension reference:**

| Dimension       | Description                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| `budgeted`      | Total amount budgeted across the month range                                          |
| `spent`         | Total amount spent (sum of transactions) across the month range                       |
| `balance_start` | Carryover balance at the **start** of the first month (leftover from the prior month) |
| `balance_end`   | Running balance at the **end** of the last month (budgeted + spent + carryover)       |
| `goal`          | Total goal amount across the month range                                              |

#### Using `QUERY_EXTRACT_*` helpers

These three helpers pull values out of a named query definition so you can reuse a query's filters and date range as inputs to `BUDGET_QUERY`:

- **`QUERY_EXTRACT_CATEGORIES("queryName")`** — uses the query's category filters to determine which categories to include. If the query has no category filter, all non-income, non-hidden categories are included.
- **`QUERY_EXTRACT_TIMEFRAME_START("queryName")`** — returns the query's start month as a `YYYY-MM` string.
- **`QUERY_EXTRACT_TIMEFRAME_END("queryName")`** — returns the query's end month as a `YYYY-MM` string.

Example — total spent for the same categories and date range as a named query called `expenses`:

```text
=BUDGET_QUERY("spent", QUERY_EXTRACT_CATEGORIES("expenses"), QUERY_EXTRACT_TIMEFRAME_START("expenses"), QUERY_EXTRACT_TIMEFRAME_END("expenses"))
```

Example — compare budgeted vs actual spent for a hard-coded month range:

```text
=BUDGET_QUERY("budgeted", QUERY_EXTRACT_CATEGORIES("expenses"), "2025-01", "2025-03")
  - BUDGET_QUERY("spent", QUERY_EXTRACT_CATEGORIES("expenses"), "2025-01", "2025-03")
```

### Show a Table

A formula card can show a table in place of one value. When a formula gives a table, for example with `QUERY_GROUP`, the card shows the table.

The **Display** setting in the card editor has four options:

- **Automatic** (the default): a table for a formula that gives a table, and one value for other formulas.
- **One value**: always one value. A formula that gives a table shows an error.
- **Table**: always a table. One value shows as a table with one cell.
- **Chart**: the table as a chart. Refer to [Show a Chart](#show-a-chart).

Some formulas give one value for some data and a table for other data, for example `FILTER`. For these formulas, set **Display** to **Table**, so that the card does not change its look when the data changes.

A table shows at most 500 rows and 60 columns. A larger table shows a warning on the card and in the editor. Functions such as `INDEX` and the totals still use all of the table.

To give the columns names and types:

1. Open the card editor.
2. Under **Columns**, give each column a name and a type.
3. Click **Save widget**.

The column types are:

- **Money**: an amount, with your currency settings. Privacy mode hides these values.
- **Percent**: a number as a percentage. For example, `0.25` shows as `25%`.
- **Number**: a number, with your number format.
- **Date**: a date, with your date format. A month such as `2024-01` shows as `Jan '24`.
- **Text**: the value as it is.
- **Automatic** (the default): **Money** for a column of numbers, and **Text** for other columns.

If a cell does not fit the type of its column, the cell shows the value as the formula gives it. For example, text in a **Money** column shows as text. The editor then shows a warning for that column.

The **Header row** setting has three options:

- **Automatic** (the default): the first row of the table is the header row when the first row has no numbers, and a column has text in the first row and only numbers below it. A table from `QUERY_PIVOT` gets a header row this way. A table from `QUERY_GROUP` does not.
- **First row**: the first row of the table is always the header row.
- **Column names only**: the header row has only the names under **Columns**.

A name under **Columns** replaces the name from the first row. If the table has no header row and no column has a name, the table shows no header row. A cell with an error shows the error, for example `#DIV/0!`. On a narrow card, scroll the table to the side to see all of the columns.

The **Totals** setting adds totals to the table:

- **None** (the default): no totals.
- **Totals row**: a row at the end with the total of each **Money** and **Number** column. The first **Text** column shows **Totals**.
- **Totals column**: a column at the end with the total of the **Money** and **Number** cells of each row.
- **Row and column**: both. The last cell of the totals row has the total of all rows.

**Percent**, **Date** and **Text** columns get no total, and a cell with an error does not count. The totals show only on the card. They are not part of the formula result, so `INDEX` and other functions do not see them.

The table view has no font size and no conditional color.

If a formula gives a table but **Display** is **One value**, the card shows an error. Set **Display** to **Automatic** or **Table**, or use `INDEX` to get one cell from the table.

### Show a Chart

A formula card can show a table as a chart. To show a chart:

1. Open the card editor.
2. Set **Display** to **Chart**.
3. Under **Chart**, select **Bar**, **Line**, **Area** or **Donut**.
4. Click **Save widget**.

The chart uses the column names, column types and **Header row** setting of the [table view](#show-a-table). Each label is a value from one column, for example a month or a category. Each value column is a series in the chart.

The **Labels** setting selects the label column:

- **Automatic** (the default): the first **Text** or **Date** column. If the table has no such column, the labels are the row numbers.
- **Row numbers**: the labels are 1, 2, 3 and so on.
- A column: the values of that column are the labels.

Under **Values**, select the columns that the chart shows. By default, the chart shows each **Money**, **Percent** and **Number** column. Click **Automatic** to go back to the default. A cell that is not a number shows as a gap in the chart.

The tooltip shows each value in the format of its column. Privacy mode hides **Money** values. The axis uses the format of the first value column, so put columns with the same type in one chart.

Spending from `QUERY_GROUP` gives negative amounts. Turn on **Flip signs** to show each value with the opposite sign. This setting changes all of the value columns.

Turn on **Stack** to put the series of a **Bar** or **Area** chart on top of each other. Negative values stack down from zero, so they do not cancel positive values.

A **Donut** chart shows only the first value column. It shows the size of each value, so a negative value and a positive value of the same size look the same. If a column has both negative and positive values, the editor shows a warning. A row with no value or a value of zero has no slice.

#### Chart a Long Table

`QUERY_GROUP` with two dimensions gives a long table: one row for each pair of values, for example a month and a category. The chart can split such a table into series, so you do not have to change it into a wide table first.

The **Series** setting selects the column that splits the values:

- **Automatic** (the default): if a label shows in more than one row, the next **Text** or **Date** column after the label column. Otherwise, no column.
- **None**: each value column is a series.
- A column: each different value of that column is a series.

For example, `=QUERY_GROUP("expenses", "month", , "category")` gives one bar for each category in each month. Turn on **Stack** to show one stacked bar for each month.

With a series column, the chart shows only the first value column. If a label and series pair has no row, its value is zero. If two rows have the same pair, the chart adds their values. If the chart has more than 20 series, the editor shows a warning, because some colors repeat. The tooltip shows only the series with a value that is not zero.

For a **Donut** chart, the setting is **Outer ring**. The chart then has two rings. For example, `=QUERY_GROUP("expenses", "category group", , "category")` shows the category groups in the inner ring and their categories in the outer ring. Each slice of the inner ring is the sum of its outer slices, so the two rings always agree. The outer slices have lighter colors of their group color. The legend shows the groups.

On a dashboard card, the chart has no axes and no legend, as the other report cards. Point to a bar, a point or a slice to see its values. A click on the chart does not open the transactions.

The chart view has no font size, no conditional color and no totals.

### Format One Value

When the card shows one value, the **Format** setting sets how the value shows. The formats are the same as the column types of a table:

- **Automatic** (the default): a number shows as **Money**, and text shows as it is.
- **Money**, **Percent**, **Number**, **Date** or **Text**: the value shows in that format.

If the format cannot show the value, for example text with **Money**, the card shows the value as the formula gives it. The editor then shows a warning. To make your own format, use **Text** and a function such as `FORMATNUMBER` or `TEXT`.

### Optional: conditional color

Formula cards support an optional **Conditional color** formula (single line) that returns a color string like `red` or `#ff0000`.

- Use the **`RESULT`** variable to reference the main formula result.
- To start from a common formula, click **Presets** and select one. The presets use the colors of positive and negative amounts in custom reports. **No color** clears the formula. You can change the formula after you select a preset.
- Under the formula, the editor shows the color that the formula gives, with a small sample of the color. If the formula gives an error, or a value that is not a color, the editor shows a message, and the card uses the default color.

## Rule formulas

Rule formulas let you compute a value from the current transaction and set a field to that computed result.

Note: rule formula inputs are **single-line** (line breaks are automatically replaced with spaces).

### Where to find the formula toggle

In **More -> Rules -> edit a rule**, on a **Set** action:

- Click the **ƒ** button to the right of the action input to enable/disable **formula mode** for that action.
- Formula mode is not available for actions that set **payee**, **category**, or **account** (those values are IDs).
- Rule action templating (the `</>` icon) and formulas are mutually exclusive: enabling one disables the other.

<img width="884" alt="A rule's notes action in formula mode, with the ƒ button boxed" src="/img/experimental/formulas/formulas-rule-toggle@2x.webp" />

### Available variables

Rule formulas evaluate with named variables from the transaction context, including:

**Date variables:**

- `today` — Current date in YYYY-MM-DD format (e.g., `"2025-12-19"`)
- `date` — Transaction date in YYYY-MM-DD format (e.g., `"2025-01-15"`)

**Numeric variables:**

- `amount` — Transaction amount (e.g., `123.45`)
  - Positive for income, negative for expenses
- `balance` — Account balance at this transaction, excluding the transaction itself
- `parent_amount` — Amount of the parent transaction, available when a rule splits a transaction

**Text variables:**

- `notes` — Transaction notes/memo field (string, may be empty)
- `imported_payee` — Original payee name from import before any rules applied (string)
- `payee_name` — Resolved payee name (string)
- `account_name` — Account name where transaction exists (string)
- `category_name` — Category name assigned to transaction (string)

**Boolean variables:**

- `cleared` — Whether transaction is cleared (`TRUE` or `FALSE`)
- `reconciled` — Whether transaction is reconciled (`TRUE` or `FALSE`)

:::caution
Rule formulas used to work in cents, so they had to divide by 100. Formulas you saved back then are not updated for you, and they now produce a result 100 times too small. Open each one and remove the `/ 100`: a formula that read `=amount / 100 * 1.05` becomes `=amount * 1.05`. The same goes for uses of the `INTEGER_TO_AMOUNT` and `AMOUNT_TO_INTEGER` functions, your formula outputs may be off by a factor of 100 for each use. Evaluate your personal formulas as likely you no longer need to use these functions.
:::

### Available functions

**`BALANCE_OF` (other accounts):**

```text
=BALANCE_OF("550e8400-e29b-41d4-a716-446655440000")
=BALANCE_OF("Checking")
```

- `BALANCE_OF("…")` — Running balance for another account, using the same cutoff as `balance` (same `date`, `sort_order`, and `id` ordering as the current transaction).
- Pass a **quoted account id** (matches an account id in your budget) for a deterministic result, or a **quoted account name** for an exact name match. If the account name is ambiguous (duplicates), the first match is used.
- If the account is not found, the value is **0**.
- For the **current** transaction’s account, use the `balance` variable instead of `BALANCE_OF`.
- `BALANCE_OF` is also available in Formula cards, where it returns the account's current balance instead — see [Account balances with `BALANCE_OF("name")`](#account-balances-with-balance_ofname) above.

**Loan payment functions (`IPMT`, `PPMT`, `NPER`, `CUMIPMT`, `CUMPRINC`):**

If you record a loan (mortgage, auto loan, etc.) payment as a single transaction, these functions let a rule split it into interest/principal or show progress, based on the transaction's own `date`. They need a **period number**, which you can derive from the loan's start date with `DATEDIF`:

```text
=IPMT(0.05/12, DATEDIF("2024-01-01", date, "M") + 1, 360, -300000)
```

This computes the interest portion of the payment for the month of the current transaction, for a 30-year (360-month) loan that started 2024-01-01 at 5% annual interest on a $300,000 principal. Swap `IPMT` for `PPMT` to get the principal portion instead, or use `CUMIPMT`/`CUMPRINC` with a `start_period` of `1` and that same period as `end_period` to get interest/principal paid to date.

These functions return their result in the same units you pass in, so write the principal as `-300000`.

### Result types

When a rule runs, Actual converts the formula result to the field type:

- **number fields**: must produce a number (or a string that parses as a number)
- **date fields**: must produce a valid date
- **boolean fields**: `TRUE`/`FALSE` (or a string that equals `"true"`/`"false"`)
- **string fields**: converted with `String(...)`
