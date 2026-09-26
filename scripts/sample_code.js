const userBatches = [
  [
    { id: 1, name: "Alice", isActive: true, role: "premium", purchases: [100, 200] },
    { id: 2, name: "Bob", isActive: false, role: "premium", purchases: [50] },
    { id: 3, name: "Charlie", isActive: true, role: "standard", purchases: [300] },
    { id: 4, name: "David", isActive: true, role: "premium", purchases: [150, 50] }
  ],
  [
    { id: 5, name: "Eva", isActive: true, role: "premium", purchases: [500] },
    { id: 6, name: "Frank", isActive: true, role: "standard", purchases: [100] }
  ]
];
 
console.time("Unoptimized Run");
 
for (let i = 0; i < 2; i++) {
  const currentBatch = userBatches[i];
  const activePremiumUsers = currentBatch.filter(user => user.isActive && user.role === 'premium');
  const userTotals = activePremiumUsers.map(user => {
    const total = user.purchases.reduce((sum, price) => sum + price, 0);
    console.log(`Audit Log -> User: ${user.name}, Total: $${total}`);
    return total;
  });
  const batchRevenue = userTotals.reduce((sum, total) => sum + total, 0);
  console.log(`Batch ${i + 1} Total Revenue: $${batchRevenue}`);
}
 
console.timeEnd("Unoptimized Run");