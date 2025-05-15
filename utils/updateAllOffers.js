/**
 * Utility script to update all product offers
 *
 * This script will:
 * 1. Find all products
 * 2. For each product, get all applicable offers (both product and category)
 * 3. Apply the best offer (highest discount) to each product
 * 4. Log detailed information about the process
 */

const Product = require('../models/productSchema');
const Offer = require('../models/offerSchema');
const Category = require('../models/categorySchema');
const mongoose = require('mongoose');
const config = require('../config/config');

/**
 * Update offers for all products
 */
const updateAllProductOffers = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.MONGODB_URL);
    console.log('Connected to database');

    console.log('Finding all products...');
    const products = await Product.find({ isBlocked: false });
    console.log(`Found ${products.length} products`);

    let updatedCount = 0;
    let noOfferCount = 0;
    let productOfferCount = 0;
    let categoryOfferCount = 0;
    let bothOfferTypesCount = 0;
    let productOfferBetterCount = 0;
    let categoryOfferBetterCount = 0;

    console.log('Updating product offers...');
    for (const product of products) {
      const result = await updateProductOffer(product);

      if (result.updated) {
        updatedCount++;

        if (result.offerType === 'product') {
          productOfferCount++;
        } else if (result.offerType === 'category') {
          categoryOfferCount++;
        }

        if (result.hasBothOfferTypes) {
          bothOfferTypesCount++;

          if (result.productOfferBetter) {
            productOfferBetterCount++;
          } else if (result.categoryOfferBetter) {
            categoryOfferBetterCount++;
          }
        }
      } else {
        noOfferCount++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total products processed: ${products.length}`);
    console.log(`Products with offers applied: ${updatedCount}`);
    console.log(`Products with no offers: ${noOfferCount}`);
    console.log(`Products with product offers applied: ${productOfferCount}`);
    console.log(`Products with category offers applied: ${categoryOfferCount}`);
    console.log(`\nOffer Comparison Statistics:`);
    console.log(`Products with both offer types available: ${bothOfferTypesCount}`);
    if (bothOfferTypesCount > 0) {
      console.log(`- Product offers better: ${productOfferBetterCount} (${Math.round(productOfferBetterCount / bothOfferTypesCount * 100)}%)`);
      console.log(`- Category offers better: ${categoryOfferBetterCount} (${Math.round(categoryOfferBetterCount / bothOfferTypesCount * 100)}%)`);
      console.log(`- Equal discounts: ${bothOfferTypesCount - productOfferBetterCount - categoryOfferBetterCount} (${Math.round((bothOfferTypesCount - productOfferBetterCount - categoryOfferBetterCount) / bothOfferTypesCount * 100)}%)`);
    }
    console.log('===============\n');

    console.log('Disconnecting from database...');
    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Error updating product offers:', error);
    process.exit(1);
  }
};

/**
 * Update offer for a single product
 * @param {Object} product - Product document
 * @returns {Object} Result object
 */
const updateProductOffer = async (product) => {
  try {
    console.log(`\nProcessing product: ${product.productName} (${product._id})`);

    // Get all valid offers for the product before updating
    const now = new Date();

    // Get product offers
    const productOffers = await Offer.find({
      type: 'product',
      applicableProducts: product._id,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    // Get category offers
    const categoryOffers = await Offer.find({
      type: 'category',
      applicableCategories: product.category,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    const hasBothOfferTypes = productOffers.length > 0 && categoryOffers.length > 0;

    // Calculate best discount for each type
    let bestProductOffer = null;
    let bestProductDiscount = 0;
    let bestCategoryOffer = null;
    let bestCategoryDiscount = 0;

    // Find best product offer
    for (const offer of productOffers) {
      const discountAmount = offer.calculateDiscount(product.price);
      if (discountAmount > bestProductDiscount) {
        bestProductDiscount = discountAmount;
        bestProductOffer = offer;
      }
    }

    // Find best category offer
    for (const offer of categoryOffers) {
      const discountAmount = offer.calculateDiscount(product.price);
      if (discountAmount > bestCategoryDiscount) {
        bestCategoryDiscount = discountAmount;
        bestCategoryOffer = offer;
      }
    }

    // Determine which offer type is better
    let productOfferBetter = false;
    let categoryOfferBetter = false;

    if (hasBothOfferTypes) {
      if (bestProductDiscount > bestCategoryDiscount) {
        productOfferBetter = true;
        console.log(`Product offer is better by ₹${(bestProductDiscount - bestCategoryDiscount).toFixed(2)}`);
      } else if (bestCategoryDiscount > bestProductDiscount) {
        categoryOfferBetter = true;
        console.log(`Category offer is better by ₹${(bestCategoryDiscount - bestProductDiscount).toFixed(2)}`);
      } else {
        console.log(`Both offers provide the same discount`);
      }
    }

    // Update the product with the best offer
    const updated = await product.updateOfferDetails();

    if (updated) {
      const offer = await Offer.findById(product.offer);
      const offerType = offer ? offer.type : 'unknown';

      return {
        updated: true,
        offerType,
        hasBothOfferTypes,
        productOfferBetter,
        categoryOfferBetter
      };
    } else {
      console.log(`No valid offers for product: ${product.productName}`);
      return {
        updated: false,
        offerType: null,
        hasBothOfferTypes: false,
        productOfferBetter: false,
        categoryOfferBetter: false
      };
    }
  } catch (error) {
    console.error(`Error updating offer for product ${product._id}:`, error);
    return {
      updated: false,
      offerType: null,
      hasBothOfferTypes: false,
      productOfferBetter: false,
      categoryOfferBetter: false
    };
  }
};

// Run the script if called directly
if (require.main === module) {
  updateAllProductOffers()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  updateAllProductOffers,
  updateProductOffer
};
