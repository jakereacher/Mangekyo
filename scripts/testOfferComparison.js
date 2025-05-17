/**
 * Test script to demonstrate offer comparison functionality
 *
 * This script will:
 * 1. Create a test product
 * 2. Create both product and category offers for the product
 * 3. Apply the offers and show which one is selected (the one with the highest discount)
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');
const Offer = require('../models/offerSchema');
const offerService = require('../services/offerService');

/**
 * Run the test
 */
const runTest = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.MONGODB_URL);
    console.log('Connected to database');

    // Find a product to test with
    const product = await Product.findOne({ isBlocked: false }).populate('category');
    if (!product) {
      console.log('No products found for testing');
      return;
    }

    console.log(`\nSelected test product: ${product.productName} (${product._id})`);
    console.log(`Category: ${product.category.name} (${product.category._id})`);
    console.log(`Original price: ₹${product.price.toFixed(2)}`);

    // Create test scenarios with different discount values
    console.log('\n=== SCENARIO 1: PRODUCT OFFER IS BETTER THAN CATEGORY OFFER ===');

    // Create a product offer (20% off)
    const productOffer = new Offer({
      name: 'Test Product Offer (20% off)',
      description: 'Test product offer for comparison',
      type: 'product',
      discountType: 'percentage',
      discountValue: 20, // 20% off
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableProducts: [product._id]
    });

    await productOffer.save();
    console.log(`Created product offer: ${productOffer.name} (${productOffer._id})`);
    console.log(`Discount: ${productOffer.discountValue}% off`);
    const productDiscountAmount = productOffer.calculateDiscount(product.price);
    console.log(`Product discount amount: ₹${productDiscountAmount.toFixed(2)}`);
    console.log(`Final price with product offer: ₹${(product.price - productDiscountAmount).toFixed(2)}`);

    // Create a category offer (10% off)
    const categoryOffer = new Offer({
      name: 'Test Category Offer (10% off)',
      description: 'Test category offer for comparison',
      type: 'category',
      discountType: 'percentage',
      discountValue: 10, // 10% off
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableCategories: [product.category._id]
    });

    await categoryOffer.save();
    console.log(`\nCreated category offer: ${categoryOffer.name} (${categoryOffer._id})`);
    console.log(`Discount: ${categoryOffer.discountValue}% off`);
    const categoryDiscountAmount = categoryOffer.calculateDiscount(product.price);
    console.log(`Category discount amount: ₹${categoryDiscountAmount.toFixed(2)}`);
    console.log(`Final price with category offer: ₹${(product.price - categoryDiscountAmount).toFixed(2)}`);

    // Show which offer is better
    if (productDiscountAmount > categoryDiscountAmount) {
      console.log(`\n✓ PRODUCT OFFER IS BETTER BY ₹${(productDiscountAmount - categoryDiscountAmount).toFixed(2)}`);
      console.log(`  Expected to select: PRODUCT OFFER`);
    } else if (categoryDiscountAmount > productDiscountAmount) {
      console.log(`\n✓ CATEGORY OFFER IS BETTER BY ₹${(categoryDiscountAmount - productDiscountAmount).toFixed(2)}`);
      console.log(`  Expected to select: CATEGORY OFFER`);
    } else {
      console.log(`\n✓ BOTH OFFERS PROVIDE THE SAME DISCOUNT`);
      console.log(`  Expected to select: Either offer`);
    }

    // Apply the offers to the product and category
    await offerService.applyProductOffer(product._id, productOffer._id);
    await offerService.applyCategoryOffer(product.category._id, categoryOffer._id);
    console.log('\nApplied both offers to product and category');

    // Get the best offer for the product
    console.log('\nCalculating best offer...');
    const offerResult1 = await offerService.getBestOfferForProduct(product._id, product.price);

    console.log(`\nACTUAL RESULT:`);
    console.log(`Best offer selected: ${offerResult1.offer.name} (${offerResult1.offer.type.toUpperCase()} OFFER)`);
    console.log(`Discount amount: ₹${offerResult1.discountAmount.toFixed(2)}`);
    console.log(`Final price: ₹${offerResult1.finalPrice.toFixed(2)}`);

    // Update the product with the best offer
    console.log('\nUpdating product with best offer...');
    await product.updateOfferDetails();

    // Clean up scenario 1
    console.log('\nCleaning up scenario 1 data...');
    await Offer.deleteOne({ _id: productOffer._id });
    await Offer.deleteOne({ _id: categoryOffer._id });

    // Reset product and category
    await Product.updateOne(
      { _id: product._id },
      { $set: { offer: null, productOffer: false, offerPercentage: 0, offerEndDate: null } }
    );

    await Category.updateOne(
      { _id: product.category._id },
      { $set: { offer: null } }
    );

    // SCENARIO 2: CATEGORY OFFER IS BETTER
    console.log('\n\n=== SCENARIO 2: CATEGORY OFFER IS BETTER THAN PRODUCT OFFER ===');

    // Create a product offer (5% off)
    const productOffer2 = new Offer({
      name: 'Test Product Offer (5% off)',
      description: 'Test product offer for comparison',
      type: 'product',
      discountType: 'percentage',
      discountValue: 5, // 5% off
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableProducts: [product._id]
    });

    await productOffer2.save();
    console.log(`Created product offer: ${productOffer2.name} (${productOffer2._id})`);
    console.log(`Discount: ${productOffer2.discountValue}% off`);
    const productDiscountAmount2 = productOffer2.calculateDiscount(product.price);
    console.log(`Product discount amount: ₹${productDiscountAmount2.toFixed(2)}`);
    console.log(`Final price with product offer: ₹${(product.price - productDiscountAmount2).toFixed(2)}`);

    // Create a category offer (15% off)
    const categoryOffer2 = new Offer({
      name: 'Test Category Offer (15% off)',
      description: 'Test category offer for comparison',
      type: 'category',
      discountType: 'percentage',
      discountValue: 15, // 15% off
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableCategories: [product.category._id]
    });

    await categoryOffer2.save();
    console.log(`\nCreated category offer: ${categoryOffer2.name} (${categoryOffer2._id})`);
    console.log(`Discount: ${categoryOffer2.discountValue}% off`);
    const categoryDiscountAmount2 = categoryOffer2.calculateDiscount(product.price);
    console.log(`Category discount amount: ₹${categoryDiscountAmount2.toFixed(2)}`);
    console.log(`Final price with category offer: ₹${(product.price - categoryDiscountAmount2).toFixed(2)}`);

    // Show which offer is better
    if (productDiscountAmount2 > categoryDiscountAmount2) {
      console.log(`\n✓ PRODUCT OFFER IS BETTER BY ₹${(productDiscountAmount2 - categoryDiscountAmount2).toFixed(2)}`);
      console.log(`  Expected to select: PRODUCT OFFER`);
    } else if (categoryDiscountAmount2 > productDiscountAmount2) {
      console.log(`\n✓ CATEGORY OFFER IS BETTER BY ₹${(categoryDiscountAmount2 - productDiscountAmount2).toFixed(2)}`);
      console.log(`  Expected to select: CATEGORY OFFER`);
    } else {
      console.log(`\n✓ BOTH OFFERS PROVIDE THE SAME DISCOUNT`);
      console.log(`  Expected to select: Either offer`);
    }

    // Apply the offers to the product and category
    await offerService.applyProductOffer(product._id, productOffer2._id);
    await offerService.applyCategoryOffer(product.category._id, categoryOffer2._id);
    console.log('\nApplied both offers to product and category');

    // Get the best offer for the product
    console.log('\nCalculating best offer...');
    const offerResult2 = await offerService.getBestOfferForProduct(product._id, product.price);

    console.log(`\nACTUAL RESULT:`);
    console.log(`Best offer selected: ${offerResult2.offer.name} (${offerResult2.offer.type.toUpperCase()} OFFER)`);
    console.log(`Discount amount: ₹${offerResult2.discountAmount.toFixed(2)}`);
    console.log(`Final price: ₹${offerResult2.finalPrice.toFixed(2)}`);

    // Update the product with the best offer
    console.log('\nUpdating product with best offer...');
    await product.updateOfferDetails();

    // Clean up scenario 2
    console.log('\nCleaning up scenario 2 data...');
    await Offer.deleteOne({ _id: productOffer2._id });
    await Offer.deleteOne({ _id: categoryOffer2._id });

    // Reset product and category
    await Product.updateOne(
      { _id: product._id },
      { $set: { offer: null, productOffer: false, offerPercentage: 0, offerEndDate: null } }
    );

    await Category.updateOne(
      { _id: product.category._id },
      { $set: { offer: null } }
    );

    console.log('Test completed and cleanup finished');

    console.log('\nDisconnecting from database...');
    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error running test:', error);
  }
};

// Run the test if called directly
if (require.main === module) {
  runTest()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { runTest };
