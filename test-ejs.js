const ejs = require('ejs');

// Create a simplified version of the template with just the problematic parts
const template = `
<% if (item.status === 'Processing') { %>
    <% if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'Failed') { %>
        <button onclick="retryPayment('<%= order._id %>', <%= order.finalAmount %>)"
                class="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition flex items-center mb-2">
            <i class="fas fa-credit-card mr-2"></i> Pay Now
        </button>

        <button onclick="cancelOrder('<%= order._id %>','<%= item.product._id %>')"
                class="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition flex items-center">
            <i class="fas fa-times-circle mr-2"></i> Cancel Order
        </button>
    <% } else if ((order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid') || order.paymentMethod === 'wallet') { %>
        <button onclick="requestCancellation('<%= order._id %>','<%= item.product._id %>')"
                class="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition flex items-center">
            <i class="fas fa-times-circle mr-2"></i> Request Cancellation
        </button>
    <% } else { %>
        <button onclick="cancelOrder('<%= order._id %>','<%= item.product._id %>')"
                class="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition flex items-center">
            <i class="fas fa-times-circle mr-2"></i> Cancel Order
        </button>
    <% } %>
<% } %>
`;

try {
  // Try to compile the template
  const compiledTemplate = ejs.compile(template);
  console.log('Template compiled successfully!');
  
  // Test rendering with sample data
  const html = compiledTemplate({
    item: { status: 'Processing' },
    order: { 
      _id: '123', 
      finalAmount: 100,
      paymentMethod: 'razorpay',
      paymentStatus: 'Failed'
    }
  });
  
  console.log('Template rendered successfully!');
} catch (err) {
  console.error('EJS compilation error:', err.message);
}
