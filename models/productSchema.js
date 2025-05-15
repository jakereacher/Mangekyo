const mongoose = require('mongoose');
const {Schema} = mongoose;


const productSchema = new Schema({
  productName : {
    type : String,
    required : true
  },
  description : {
    type : String,
    required : true
  },
  category:{
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  price:{
    type: Number,
    required: true
  },
  productOffer: {
    type: Boolean,
    required: true,
    default: false,
  },
  offer: {
    type: Schema.Types.ObjectId,
    ref: 'Offer',
    default: null
  },
  quantity:{
    type: Number,
    required: true
  },
  productImage:{
    type: [String],
    required: true
  },
  isBlocked:{
    type: Boolean,
    default: false
  },
  offerPercentage: {
    type: Number,
    default: 0,
  },
  offerEndDate: {
    type: Date,
    default: null,
  },
  popularityScore: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  status:{
    type: String,
    enum:["Available","Out of Stock","Discontinued"],
    required: true,
    default: "Available"
  },
  },{timestamps:true});

// Virtual for final price after offer
productSchema.virtual('finalPrice').get(function() {
  if (this.offerPercentage > 0) {
    const discountAmount = (this.price * this.offerPercentage) / 100;
    return this.price - discountAmount;
  }
  return this.price;
});

// Method to calculate and update offer details
productSchema.methods.updateOfferDetails = async function() {
  const offerService = require('../services/offerService');
  const Offer = require('./offerSchema');
  const Category = require('./categorySchema');
  const now = new Date();

  // Check if current offer is expired
  if (this.offer) {
    const currentOffer = await Offer.findById(this.offer);
    if (currentOffer && (!currentOffer.isActive || currentOffer.endDate < now)) {
      console.log(`Clearing expired offer from product ${this._id}: Offer ${currentOffer._id} expired on ${currentOffer.endDate}`);
      this.offerPercentage = 0;
      this.offer = null;
      this.productOffer = false;
      this.offerEndDate = null;
      await this.save();
    }
  }

  // Get the best offer for this product
  const offerResult = await offerService.getBestOfferForProduct(this._id, this.price);

  if (offerResult.hasOffer) {
    // Double-check offer validity
    const offer = offerResult.offer;
    if (!offer.isActive || offer.startDate > now || offer.endDate < now) {
      console.log(`Skipping expired or inactive offer: ${offer.name} (${offer._id})`);
      // Clear offer details
      this.offerPercentage = 0;
      this.offer = null;
      this.productOffer = false;
      this.offerEndDate = null;
      await this.save();
      return false;
    }

    // Calculate offer percentage
    const offerPercentage = (offerResult.discountAmount / this.price) * 100;

    // Log offer application details
    console.log(`\n=== Applying Offer to Product ${this.productName} (${this._id}) ===`);
    console.log(`- Offer: ${offer.name} (${offer._id})`);

    // Highlight the offer type with a visual indicator
    if (offer.type === 'product') {
      console.log(`- Type: PRODUCT OFFER ⭐ (Product-specific offer applied)`);
    } else if (offer.type === 'category') {
      console.log(`- Type: CATEGORY OFFER ⭐ (Category-wide offer applied)`);
    } else {
      console.log(`- Type: ${offer.type}`);
    }

    console.log(`- Discount: ${offer.discountType === 'percentage' ? offer.discountValue + '%' : '₹' + offer.discountValue}`);
    console.log(`- Discount Amount: ₹${offerResult.discountAmount.toFixed(2)}`);
    console.log(`- Original Price: ₹${this.price.toFixed(2)}`);
    console.log(`- Final Price: ₹${offerResult.finalPrice.toFixed(2)}`);
    console.log(`- Offer Percentage: ${offerPercentage.toFixed(2)}%`);
    console.log(`- Valid Until: ${offer.endDate.toLocaleDateString()}`);

    // Check if there were competing offers
    const Category = require('./categorySchema');
    const category = await Category.findById(this.category);

    if (category && category.offer) {
      const categoryOffer = await Offer.findById(category.offer);
      if (categoryOffer && categoryOffer._id.toString() !== offer._id.toString() &&
          categoryOffer.isActive && categoryOffer.startDate <= now && categoryOffer.endDate >= now) {

        const categoryDiscountAmount = categoryOffer.calculateDiscount(this.price);

        if (offer.type === 'product') {
          console.log(`\n📊 OFFER COMPARISON:`);
          console.log(`  Selected PRODUCT offer (${offer.discountValue}${offer.discountType === 'percentage' ? '%' : '₹'}) saves ₹${offerResult.discountAmount.toFixed(2)}`);
          console.log(`  Available CATEGORY offer (${categoryOffer.discountValue}${categoryOffer.discountType === 'percentage' ? '%' : '₹'}) would save ₹${categoryDiscountAmount.toFixed(2)}`);
          console.log(`  PRODUCT offer is better by ₹${(offerResult.discountAmount - categoryDiscountAmount).toFixed(2)}`);
        }
      }
    }

    // Check for product offer if category offer was applied
    if (offer.type === 'category') {
      const productOffers = await Offer.find({
        type: 'product',
        applicableProducts: this._id,
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
      });

      if (productOffers.length > 0) {
        let bestProductOffer = null;
        let bestProductDiscount = 0;

        for (const productOffer of productOffers) {
          const discountAmount = productOffer.calculateDiscount(this.price);
          if (discountAmount > bestProductDiscount) {
            bestProductDiscount = discountAmount;
            bestProductOffer = productOffer;
          }
        }

        if (bestProductOffer) {
          console.log(`\n📊 OFFER COMPARISON:`);
          console.log(`  Selected CATEGORY offer (${offer.discountValue}${offer.discountType === 'percentage' ? '%' : '₹'}) saves ₹${offerResult.discountAmount.toFixed(2)}`);
          console.log(`  Available PRODUCT offer (${bestProductOffer.discountValue}${bestProductOffer.discountType === 'percentage' ? '%' : '₹'}) would save ₹${bestProductDiscount.toFixed(2)}`);
          console.log(`  CATEGORY offer is better by ₹${(offerResult.discountAmount - bestProductDiscount).toFixed(2)}`);
        }
      }
    }

    console.log(`=================================================`);

    // Update product with offer details
    this.offerPercentage = parseFloat(offerPercentage.toFixed(2));
    this.offer = offerResult.offer._id;
    this.productOffer = true;

    // Set offer end date
    if (offerResult.offer.endDate) {
      this.offerEndDate = offerResult.offer.endDate;
    }

    await this.save();
    return true;
  } else {
    // Clear offer details if no valid offer
    this.offerPercentage = 0;
    this.offer = null;
    this.productOffer = false;
    this.offerEndDate = null;

    await this.save();
    return false;
  }
};

// Pre-save hook to automatically update status based on quantity
productSchema.pre('save', function(next) {
  // Update status based on quantity
  if (this.isModified('quantity')) {
    if (this.quantity > 0) {
      this.status = "Available";
    } else {
      this.status = "Out of Stock";
    }
  }
  next();
});

// Set toJSON option to include virtuals
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

  module.exports = Product;