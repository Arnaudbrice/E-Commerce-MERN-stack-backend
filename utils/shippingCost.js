// Backend calculates shipping
export const calculateShippingCost = (cartItems, address) => {
  const totalWeight = cartItems.reduce(
    (sum, item) => sum + item.weight * item.quantity,
    0,
  );

  if (address.country !== "Germany") {
    return 15.0;
  } else if (totalWeight <= 2) {
    return 3.5;
  } else if (totalWeight <= 5) {
    return 5.9;
  } else {
    //totalWeight > 5
    return 9.9;
  }
};
