// Sample Data
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

// Outer loop runs exactly 2 times (for 2 batches)
for (let i = 0; i < 2; i++) {
  const currentBatch = userBatches[i];

  // 1. Filter active premium users (Loop 1)
  const activePremiumUsers = currentBatch.filter(user => user.isActive && user.role === 'premium');

  // 2. Map to extract total purchase per user (Loop 2 + internal reduce)
  const userTotals = activePremiumUsers.map(user => {
    // Nested loop summing up purchases
    const total = user.purchases.reduce((sum, price) => sum + price, 0);
    
    // Simulating an expensive operation/log inside the map
    console.log(`Audit Log -> User: ${user.name}, Total: $${total}`);
    return total;
  });

  // 3. Reduce to get the final batch total (Loop 3)
  const batchRevenue = userTotals.reduce((sum, total) => sum + total, 0);

  console.log(`Batch ${i + 1} Total Revenue: $${batchRevenue}`);
}

console.timeEnd("Unoptimized Run");