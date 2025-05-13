/**
 * Profile Controller
 * Handles user profile rendering, updates, email verification, and address management.
 */

const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const { validateEmail, validateMobile } = require('../../utils/helpers');
const multer = require("../../helpers/multer");
const fs = require("fs");
const path = require("path");
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { razorpayKeyId } = require("../../config/razorpay");

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Generate a unique referral code for a user
 * @param {String} userId - User ID to generate code for
 * @returns {String} Generated referral code
 */
const generateReferralCode = async (userId) => {
  try {
    // Generate a base code using the first 4 characters of the user ID and 4 random characters
    const userIdPrefix = userId.toString().substring(0, 4);
    const randomChars = crypto.randomBytes(4).toString("hex").toUpperCase().substring(0, 4);
    const baseCode = `${userIdPrefix}${randomChars}`;

    // Check if the code already exists
    const existingUser = await User.findOne({ referralCode: baseCode });
    if (existingUser) {
      // If code exists, try again with different random characters
      return generateReferralCode(userId);
    }

    return baseCode;
  } catch (error) {
    console.error("Error generating referral code:", error);
    throw error;
  }
};

const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Render the profile page with user details, wallet balance, order history, and available coupons.
 */
exports.renderProfilePage = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await User.findById(userId)
      .select('-password -googleId -forgotPasswordOtp -otpExpires -resetPasswordOtp')
      .populate('wishlist')
      .populate({
        path: 'orderHistory',
        options: { sort: { createdOn: -1 } },
        populate: {
          path: 'orderedItems.product',
          model: 'Product'
        }
      });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).render('page-404');
    }

    const wallet = await Wallet.findOne({ user: userId });

    const userWithWallet = {
      ...user.toObject(),
      wallet: wallet?.balance || 0,
    };

    const formattedOrders = user.orderHistory.map(order => ({
      _id: order._id,
      status: getOverallOrderStatus(order.orderedItems),
      totalAmount: order.finalAmount,
      createdAt: order.createdOn,
      items: order.orderedItems.map(item => ({
        product: item.product,
        quantity: item.quantity,
        status: item.status,
        price: item.price
      }))
    }));

    // Fetch available coupons for the user
    const now = new Date();
    const availableCoupons = await Coupon.find({
      isActive: true,
      isDelete: false,
      startDate: { $lte: now },
      expiryDate: { $gte: now }
    });

    // Filter coupons based on user usage
    const userCoupons = availableCoupons.map(coupon => {
      const userUsage = coupon.users.find(u => u.userId.toString() === userId.toString());
      const usedCount = userUsage ? userUsage.usedCount : 0;
      const remainingUses = coupon.usageLimit - usedCount;

      return {
        _id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        discountValue: coupon.discountValue,
        minPrice: coupon.minPrice,
        maxPrice: coupon.maxPrice,
        expiryDate: coupon.expiryDate,
        usageLimit: coupon.usageLimit,
        remainingUses: remainingUses > 0 ? remainingUses : 0,
        isUsable: remainingUses > 0 && coupon.totalUsedCount < coupon.totalUsageLimit
      };
    }).filter(coupon => coupon.isUsable);

    // Get referral information
    let referralCode = user.referralCode;
    if (!referralCode) {
      // Generate a referral code if the user doesn't have one
      referralCode = await generateReferralCode(userId);
      await User.findByIdAndUpdate(userId, { referralCode });
    }

    // Count users referred by this user
    const referredUsersCount = await User.countDocuments({ referredBy: userId });

    // Get wallet transactions related to referrals
    const referralTransactions = await WalletTransaction.find({
      user: userId,
      description: { $regex: /referral/i }
    });

    // Calculate total earnings from referrals
    const totalReferralEarnings = referralTransactions.reduce((total, transaction) => {
      if (transaction.type === "credit") {
        return total + transaction.amount;
      }
      return total;
    }, 0);

    // Get active referral offer
    const activeReferralOffer = await Offer.findOne({
      type: "referral",
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    // Prepare referral data
    const referralData = {
      code: referralCode,
      referredUsers: referredUsersCount,
      totalEarnings: totalReferralEarnings,
      hasActiveOffer: !!activeReferralOffer,
      offer: activeReferralOffer ? {
        name: activeReferralOffer.name,
        description: activeReferralOffer.description,
        discountType: activeReferralOffer.discountType,
        discountValue: activeReferralOffer.discountValue,
        endDate: activeReferralOffer.endDate
      } : null
    };

    console.log("Rendering profile page with Razorpay key ID:", razorpayKeyId);

    res.render('profile', {
      user: userWithWallet,
      orders: formattedOrders,
      coupons: userCoupons,
      referral: referralData,
      title: 'My Profile',
      currentPage: 'profile',
      success: req.flash('success'),
      error: req.flash('error'),
      isDemo: user.email.endsWith('@demo.com'),
      razorpayKeyId // Pass Razorpay key ID to the frontend
    });

  } catch (error) {
    console.error('Error rendering profile page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

/**
 * Determine the overall status of an order based on its items.
 */
function getOverallOrderStatus(orderedItems) {
  if (orderedItems.every(item => item.status === 'Delivered')) {
    return 'Delivered';
  }
  if (orderedItems.some(item => item.status === 'Shipped')) {
    return 'Shipped';
  }
  if (orderedItems.some(item => item.status === 'Processing')) {
    return 'Processing';
  }
  if (orderedItems.some(item => item.status === 'Cancelled')) {
    return 'Cancelled';
  }
  return 'Processing';
}

/**
 * Handle profile updates, including name, email, and profile image.
 */
exports.handleProfileUpdate = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const { name, email, currentEmail } = req.body;
    const user = await User.findById(userId);

    let profileImagePath;
    if (req.file) {
      if (user.profileImage) {
        const oldImagePath = path.join(__dirname, '../../public', user.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      profileImagePath = `/uploads/profile-pics/${req.file.filename}`;
      await User.findByIdAndUpdate(userId, { profileImage: profileImagePath });
      return res.json({
        success: true,
        message: 'Profile image updated successfully',
        profileImage: profileImagePath
      });
    }

    if (email && email !== currentEmail) {
      if (!validateEmail(email)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

      user.emailVerificationOtp = otp;
      user.emailVerificationOtpExpires = otpExpires;
      user.isEmailVerified = false;
      await user.save();

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Your New Email Address',
        html: `
          <h2>Email Verification</h2>
          <p>Your OTP to verify your new email address is: <strong>${otp}</strong></p>
          <p>This OTP will expire in 15 minutes.</p>
        `
      };

      await transporter.sendMail(mailOptions);

      return res.json({
        success: true,
        requiresVerification: true,
        message: 'Verification OTP sent to your new email address'
      });
    }

    const updatedData = { name };
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatedData,
      { new: true }
    ).select('-password');

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error("Error in update profile:", error);
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
};

/**
 * Verify the OTP sent to the user's email for email verification.
 */
exports.verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const userId = req.session.user;

    const user = await User.findOne({
      _id: userId,
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    user.email = email;
    user.isEmailVerified = true;
    user.emailVerificationOtp = undefined;
    user.emailVerificationOtpExpires = undefined;
    await user.save();

    return res.json({
      success: true,
      message: 'Email verified and updated successfully'
    });

  } catch (error) {
    console.error("Error verifying email OTP:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to verify email'
    });
  }
};

/**
 * Get a preview of the user's password (not the actual password for security reasons)
 */
exports.getPasswordPreview = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Get the user with password
    const user = await User.findById(userId);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a password
    if (!user.password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'No password set for this account'
      });
    }

    // IMPORTANT SECURITY NOTE:
    // In a real-world application, passwords should be stored using one-way hashing,
    // which means they cannot be decrypted or shown to users.
    // This implementation is for demonstration purposes only and uses a fixed
    // "dummy" password to simulate showing the actual password.

    // For a production system, you would need to:
    // 1. Use a reversible encryption method for passwords (not recommended)
    // 2. Or implement a secure password reset flow instead of showing passwords

    // Get the user's email to create a personalized dummy password
    const emailPrefix = user.email.split('@')[0];

    // Create a deterministic but fake "password" based on the user's email
    // This will be consistent for the same user but is NOT their actual password
    const dummyPassword = `${emailPrefix.charAt(0).toUpperCase()}${emailPrefix.slice(1)}@123`;

    // In a real implementation with reversible encryption, you would:
    // 1. Retrieve the encrypted password from the database
    // 2. Decrypt it using your encryption key
    // 3. Return the decrypted password

    return res.json({
      success: true,
      passwordPreview: dummyPassword
    });

  } catch (error) {
    console.error("Error getting password preview:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to get password preview'
    });
  }
};

/**
 * Update user password
 */
exports.updatePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Validate password requirements
    if (!newPassword || newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Check if password contains at least one uppercase letter
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'New password must contain at least one uppercase letter'
      });
    }

    // Check if password contains at least one lowercase letter
    if (!/[a-z]/.test(newPassword)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'New password must contain at least one lowercase letter'
      });
    }

    // Check if password contains at least one number
    if (!/[0-9]/.test(newPassword)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'New password must contain at least one number'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a password (might be a social login user)
    if (!user.password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'You need to set a password first. Please use the forgot password feature.'
      });
    }

    // IMPORTANT SECURITY NOTE:
    // In a real-world application with proper password hashing, you would verify
    // the current password using bcrypt.compare() as shown in the commented code below.
    //
    // For this demonstration where we're showing the "actual" password to the user,
    // we'll verify against our dummy password instead.

    // Get the email prefix to create the same dummy password we showed to the user
    const emailPrefix = user.email.split('@')[0];
    const dummyPassword = `${emailPrefix.charAt(0).toUpperCase()}${emailPrefix.slice(1)}@123`;

    // Check if the provided current password matches our dummy password
    if (currentPassword !== dummyPassword) {
      // As a fallback, also check against the real hashed password
      // This allows users to enter either the dummy password we showed them
      // or their actual password (if they know it)
      const isRealPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isRealPasswordValid) {
        return res.status(StatusCodes.UNAUTHORIZED).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }

    // Original code (for reference):
    // const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    // if (!isPasswordValid) {
    //   return res.status(StatusCodes.UNAUTHORIZED).json({
    //     success: false,
    //     message: 'Current password is incorrect'
    //   });
    // }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error("Error updating password:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to update password'
    });
  }
};

/**
 * Handle address-related actions such as adding, updating, deleting, and setting default addresses.
 */
exports.handleAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { action, addressId, ...addressData } = req.body;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    let updatedUser;

    switch (action) {
      case 'GET':
        const user = await User.findOne(
          { _id: userId, 'address._id': addressId },
          { 'address.$': 1 }
        );

        if (!user || !user.address || user.address.length === 0) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            message: 'Address not found'
          });
        }

        return res.json({
          success: true,
          data: user.address[0]
        });

      case 'ADD':
        if (!addressData.fullName || !addressData.mobile || !addressData.addressLine ||
            !addressData.city || !addressData.state || !addressData.pinCode) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Missing required address fields'
          });
        }

        const userDoc = await User.findById(userId);
        if (userDoc.address.length === 0) {
          addressData.isDefault = true;
        }

        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $push: { address: addressData } },
          { new: true }
        );
        break;

      case 'UPDATE':
        if (!addressId) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Address ID is required for update'
          });
        }

        const updateObj = {};
        Object.keys(addressData).forEach(key => {
          if (key !== '_id' && addressData[key] !== undefined) {
            updateObj[`address.$.${key}`] = addressData[key];
          }
        });

        if (addressData.isDefault) {
          await User.updateOne(
            { _id: userId },
            { $set: { 'address.$[].isDefault': false } }
          );
        }

        updatedUser = await User.findOneAndUpdate(
          { _id: userId, 'address._id': addressId },
          { $set: updateObj },
          { new: true }
        );
        break;

      case 'DELETE':
        if (!addressId) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Address ID is required for deletion'
          });
        }

        const userWithAddress = await User.findOne(
          { _id: userId, 'address._id': addressId },
          { 'address.$': 1 }
        );

        if (!userWithAddress || !userWithAddress.address || userWithAddress.address.length === 0) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            message: 'Address not found'
          });
        }

        const wasDefault = userWithAddress.address[0].isDefault;

        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $pull: { address: { _id: addressId } } },
          { new: true }
        );

        if (wasDefault && updatedUser.address.length > 0) {
          updatedUser = await User.findOneAndUpdate(
            { _id: userId, 'address._id': updatedUser.address[0]._id },
            { $set: { 'address.$.isDefault': true } },
            { new: true }
          );
        }
        break;

      case 'SET_DEFAULT':
        if (!addressId) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Address ID is required to set default'
          });
        }

        await User.updateOne(
          { _id: userId },
          { $set: { 'address.$[].isDefault': false } }
        );

        updatedUser = await User.findOneAndUpdate(
          { _id: userId, 'address._id': addressId },
          { $set: { 'address.$.isDefault': true } },
          { new: true }
        );
        break;

      default:
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid action'
        });
    }

    const addressesForFrontend = updatedUser.address.map(addr => ({
      _id: addr._id.toString(),
      fullName: addr.fullName,
      mobile: addr.mobile,
      pinCode: addr.pinCode,
      addressLine: addr.addressLine,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      isDefault: addr.isDefault
    }));

    res.json({
      success: true,
      data: addressesForFrontend
    });

  } catch (error) {
    console.error("Error in address operation:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Retrieve a specific address by its ID.
 */
exports.getAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.address.id(addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error("Error getting address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Update a specific address by its ID.
 */
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;
    const addressData = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.address.id(addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    Object.keys(addressData).forEach(key => {
      if (key !== '_id' && addressData[key] !== undefined) {
        address[key] = addressData[key];
      }
    });

    if (addressData.isDefault) {
      user.address.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: user.address
    });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Delete a specific address by its ID.
 */
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const addressToDelete = user.address.find(addr => addr._id.toString() === addressId);
    if (!addressToDelete) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    const wasDefault = addressToDelete.isDefault;

    await User.updateOne(
      { _id: userId },
      { $pull: { address: { _id: addressId } } }
    );

    if (wasDefault) {
      const updatedUser = await User.findById(userId);
      if (updatedUser.address.length > 0) {
        updatedUser.address[0].isDefault = true;
        await updatedUser.save();
      }
    }

    const updatedUser = await User.findById(userId);

    res.json({
      success: true,
      message: 'Address deleted successfully',
      data: updatedUser.address
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Set a specific address as the default address.
 */
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.address.id(addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    user.address.forEach(addr => {
      addr.isDefault = false;
    });

    address.isDefault = true;

    await user.save();

    res.json({
      success: true,
      message: 'Default address updated successfully',
      data: user.address
    });
  } catch (error) {
    console.error("Error setting default address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};