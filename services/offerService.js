const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

/**
 * Get all valid offers (not expired and active)
 */
const getAllValidOffers = async () => {
  const now = new Date();
  return await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
};

/**
 * Get valid offers by type
 * @param {String} type - Offer type (product, category, referral)
 */
const getValidOffersByType = async (type) => {
  const now = new Date();
  return await Offer.find({
    type,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
};

/**
 * Get valid offers for a specific product
 * @param {String} productId - Product ID
 */
const getValidOffersForProduct = async (productId) => {
  const now = new Date();

  // Get the product with its category
  const product = await Product.findById(productId).populate('category');
  if (!product) {
    return [];
  }

  // Get direct product offers
  const productOffers = await Offer.find({
    type: 'product',
    applicableProducts: productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  // Double-check each product offer to ensure it's not expired
  const validProductOffers = productOffers.filter(offer => {
    return offer.isActive && offer.startDate <= now && offer.endDate >= now;
  });

  // Get category offers for the product's category
  const categoryOffers = await Offer.find({
    type: 'category',
    applicableCategories: product.category._id,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  // Double-check each category offer to ensure it's not expired
  const validCategoryOffers = categoryOffers.filter(offer => {
    return offer.isActive && offer.startDate <= now && offer.endDate >= now;
  });

  // Log if both offer types are available
  if (validProductOffers.length > 0 && validCategoryOffers.length > 0) {
    console.log(`Product ${product.productName} (${productId}) has both product and category offers available.`);
    console.log(`- Product offers: ${validProductOffers.map(o => `${o.name} (${o.discountType}: ${o.discountValue})`).join(', ')}`);
    console.log(`- Category offers: ${validCategoryOffers.map(o => `${o.name} (${o.discountType}: ${o.discountValue})`).join(', ')}`);
  }

  return [...validProductOffers, ...validCategoryOffers];
};

/**
 * Get the best offer for a product
 * @param {String} productId - Product ID
 * @param {Number} price - Product price
 */
const getBestOfferForProduct = async (productId, price) => {
  const offers = await getValidOffersForProduct(productId);
  const now = new Date();

  if (offers.length === 0) {
    return {
      hasOffer: false,
      discountAmount: 0,
      finalPrice: price,
      offer: null
    };
  }

  // Group offers by type for better logging
  const productOffers = offers.filter(offer => offer.type === 'product');
  const categoryOffers = offers.filter(offer => offer.type === 'category');

  // Calculate discount for each offer and find the best one
  let bestOffer = null;
  let maxDiscount = 0;
  let offerDiscounts = [];

  for (const offer of offers) {
    // Double-check offer validity before calculating discount
    if (!offer.isActive || offer.startDate > now || offer.endDate < now) {
      console.log(`Skipping expired or inactive offer: ${offer.name} (${offer._id})`);
      continue;
    }

    const discountAmount = offer.calculateDiscount(price);

    // Store discount information for logging
    offerDiscounts.push({
      name: offer.name,
      type: offer.type,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      discountAmount: discountAmount,
      offerEndDate: offer.endDate
    });

    if (discountAmount > maxDiscount) {
      maxDiscount = discountAmount;
      bestOffer = offer;
    }
  }

  // Log detailed information when multiple offers are available
  if (productOffers.length > 0 && categoryOffers.length > 0) {
    const product = await Product.findById(productId);
    const productName = product ? product.productName : productId;

    console.log(`\n=== Offer Comparison for ${productName} (Original Price: ₹${price}) ===`);

    // Find best product offer and best category offer
    let bestProductOffer = null;
    let bestProductDiscount = 0;
    let bestCategoryOffer = null;
    let bestCategoryDiscount = 0;

    // Find best product offer
    for (const offer of productOffers) {
      if (!offer.isActive || offer.startDate > now || offer.endDate < now) continue;
      const discountAmount = offer.calculateDiscount(price);
      if (discountAmount > bestProductDiscount) {
        bestProductDiscount = discountAmount;
        bestProductOffer = offer;
      }
    }

    // Find best category offer
    for (const offer of categoryOffers) {
      if (!offer.isActive || offer.startDate > now || offer.endDate < now) continue;
      const discountAmount = offer.calculateDiscount(price);
      if (discountAmount > bestCategoryDiscount) {
        bestCategoryDiscount = discountAmount;
        bestCategoryOffer = offer;
      }
    }

    // Compare best product offer vs best category offer
    console.log(`\n--- PRODUCT vs CATEGORY OFFER COMPARISON ---`);

    if (bestProductOffer) {
      console.log(`BEST PRODUCT OFFER: ${bestProductOffer.name}`);
      console.log(`- Discount: ${bestProductOffer.discountType === 'percentage' ? bestProductOffer.discountValue + '%' : '₹' + bestProductOffer.discountValue}`);
      console.log(`- Amount Off: ₹${bestProductDiscount.toFixed(2)}`);
      console.log(`- Final Price: ₹${(price - bestProductDiscount).toFixed(2)}`);
    } else {
      console.log(`NO VALID PRODUCT OFFERS AVAILABLE`);
    }

    console.log(`\nvs\n`);

    if (bestCategoryOffer) {
      console.log(`BEST CATEGORY OFFER: ${bestCategoryOffer.name}`);
      console.log(`- Discount: ${bestCategoryOffer.discountType === 'percentage' ? bestCategoryOffer.discountValue + '%' : '₹' + bestCategoryOffer.discountValue}`);
      console.log(`- Amount Off: ₹${bestCategoryDiscount.toFixed(2)}`);
      console.log(`- Final Price: ₹${(price - bestCategoryDiscount).toFixed(2)}`);
    } else {
      console.log(`NO VALID CATEGORY OFFERS AVAILABLE`);
    }

    // Determine which offer is better
    if (bestProductDiscount > bestCategoryDiscount) {
      console.log(`\n✓ PRODUCT OFFER IS BETTER BY ₹${(bestProductDiscount - bestCategoryDiscount).toFixed(2)}`);
    } else if (bestCategoryDiscount > bestProductDiscount) {
      console.log(`\n✓ CATEGORY OFFER IS BETTER BY ₹${(bestCategoryDiscount - bestProductDiscount).toFixed(2)}`);
    } else if (bestProductOffer && bestCategoryOffer) {
      console.log(`\n✓ BOTH OFFERS PROVIDE THE SAME DISCOUNT`);
    }

    // Show all offers sorted by discount amount
    console.log(`\n--- ALL AVAILABLE OFFERS (SORTED BY DISCOUNT) ---`);
    offerDiscounts.sort((a, b) => b.discountAmount - a.discountAmount);

    offerDiscounts.forEach(info => {
      const isSelected = bestOffer && bestOffer.name === info.name;
      const marker = isSelected ? '✓ SELECTED' : '';
      console.log(`${info.type.toUpperCase()} OFFER: ${info.name} - ₹${info.discountAmount.toFixed(2)} off (${info.discountType}: ${info.discountValue}) ${marker}`);
    });

    console.log(`\n--- FINAL SELECTION ---`);
    console.log(`Final price after best offer: ₹${(price - maxDiscount).toFixed(2)}`);
    console.log(`Selected offer: ${bestOffer.name} (${bestOffer.type})`);
    console.log(`Offer valid until: ${bestOffer.endDate.toLocaleDateString()}`);
    console.log('=============================================\n');
  }

  return {
    hasOffer: !!bestOffer,
    discountAmount: maxDiscount,
    finalPrice: price - maxDiscount,
    offer: bestOffer
  };
};

/**
 * Apply offers to a list of products
 * @param {Array} products - List of products
 */
const applyOffersToProducts = async (products) => {
  const productsWithOffers = [];

  for (const product of products) {
    const price = product.price;
    const offerResult = await getBestOfferForProduct(product._id, price);

    productsWithOffers.push({
      ...product.toObject ? product.toObject() : product,
      offerPrice: offerResult.finalPrice,
      discountAmount: offerResult.discountAmount,
      hasOffer: offerResult.hasOffer,
      appliedOffer: offerResult.offer
    });
  }

  return productsWithOffers;
};

/**
 * Apply product offer
 * @param {String} productId - Product ID
 * @param {String} offerId - Offer ID
 */
const applyProductOffer = async (productId, offerId) => {
  // Validate product and offer
  const product = await Product.findById(productId);
  const offer = await Offer.findById(offerId);

  if (!product || !offer || offer.type !== 'product') {
    return false;
  }

  // Update offer's applicable products
  await Offer.findByIdAndUpdate(offerId, {
    $addToSet: { applicableProducts: productId }
  });

  // Update product's offer reference
  await Product.findByIdAndUpdate(productId, {
    offer: offerId,
    productOffer: true
  });

  return true;
};

/**
 * Apply category offer
 * @param {String} categoryId - Category ID
 * @param {String} offerId - Offer ID
 */
const applyCategoryOffer = async (categoryId, offerId) => {
  // Validate category and offer
  const category = await Category.findById(categoryId);
  const offer = await Offer.findById(offerId);

  if (!category || !offer || offer.type !== 'category') {
    return false;
  }

  // Update offer's applicable categories
  await Offer.findByIdAndUpdate(offerId, {
    $addToSet: { applicableCategories: categoryId }
  });

  // Update category's offer reference
  await Category.findByIdAndUpdate(categoryId, {
    offer: offerId
  });

  return true;
};

/**
 * Remove product offer
 * @param {String} productId - Product ID
 */
const removeProductOffer = async (productId) => {
  const product = await Product.findById(productId).populate('offer');

  if (!product || !product.offer) {
    return false;
  }

  // Remove product from offer's applicable products
  await Offer.findByIdAndUpdate(product.offer._id, {
    $pull: { applicableProducts: productId }
  });

  // Remove offer reference from product
  await Product.findByIdAndUpdate(productId, {
    offer: null,
    productOffer: false
  });

  return true;
};

/**
 * Remove category offer
 * @param {String} categoryId - Category ID
 */
const removeCategoryOffer = async (categoryId) => {
  const category = await Category.findById(categoryId).populate('offer');

  if (!category || !category.offer) {
    return false;
  }

  // Remove category from offer's applicable categories
  await Offer.findByIdAndUpdate(category.offer._id, {
    $pull: { applicableCategories: categoryId }
  });

  // Remove offer reference from category
  await Category.findByIdAndUpdate(categoryId, {
    offer: null
  });

  return true;
};

module.exports = {
  getAllValidOffers,
  getValidOffersByType,
  getValidOffersForProduct,
  getBestOfferForProduct,
  applyOffersToProducts,
  applyProductOffer,
  applyCategoryOffer,
  removeProductOffer,
  removeCategoryOffer
};
