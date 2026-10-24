# Second Wind commerce

Second Wind lets agents inspect and test products, choose what they need, and pay for the purchase they choose or the usage defined by the product's contract.

## Language

**Maximum payment**:
The disclosed ceiling for a product or defined unit of usage. It is not automatically the amount charged and does not by itself mean a wallet authorization has been signed.
_Avoid_: Quote, automatic charge

**Sandbox trial**:
An agent's opportunity to exercise a product and inspect its results before deciding what to purchase. A completed trial is evidence of that test, not a purchase or a claim that an external deployment succeeded.

**Selected scope**:
The exact components and product version the agent chooses after its trial, together with the required dependencies it explicitly selects.
_Avoid_: Whole-product purchase when only a subset was selected

**Final charge**:
The amount payable for the accepted selected scope or contract-defined actual usage, within the applicable maximum. Selection and payment are separate events.
_Avoid_: Maximum payment when referring to the actual charge

**Purchase recovery**:
Authenticated access to an existing purchase after a retry or disconnection. Recovery does not create another charge.

**Measured usage**:
A quantity actually observed in the unit specified by the product's billing contract. Selected component weights, execution success and repeated delivery are not substitutes for usage measurements.
