# V3 Fee Engine QA

## Implemented
- Class-specific fee components.
- Enable/disable each component per class.
- One-time, every-installment, specific-installment, monthly and quarterly frequencies.
- Per-class due day and grace period.
- September penalty and December penalty are independently configurable.
- December full-clear behavior is supported naturally: a fully paid charge is not penalized.
- Due is calculated from scheduled charges, ledger payments, approved adjustments and opening arrears.
- `students.dueAmount` is no longer mutated when recording a new payment or fee adjustment; it is treated as a legacy/display field only.
- One-time charges are generated once and disappear from future due after payment.
- Class-specific structures are kept separate by school and academic year in the current browser settings layer.

## Formula
`Current Due = Scheduled Charges + Opening Arrears + Applicable Penalties - Itemized Payments - Approved Adjustments`

The finance screens use the fee engine when class fee settings exist. If a student has no configured fee charges yet, the existing `openingArrears`/legacy `dueAmount` is shown as the starting balance so existing imported students are not lost.

## Important production follow-up
The class fee structure currently lives in the app's existing school-settings persistence layer (localStorage). After the school's Firebase configuration is supplied, move these settings to Firestore so the same fee structure is authoritative across devices and users.
