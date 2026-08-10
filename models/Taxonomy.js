// models/Taxonomy.js
/**
 * Combined taxonomy model file.
 * Exports three Mongoose models from a single file:
 *   - WorkTypeCategory  (top-level: "kitchen", "bathroom", …)
 *   - WorkType          (mid-level: "kitchen-flooring", …)
 *   - Subtype           (leaf:      "Hardwood", "Porcelain", …)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// WorkTypeCategory
// ─────────────────────────────────────────────────────────────────────────────

const workTypeCategorySchema = new Schema(
  {
    /**
     * Slug used throughout the system (e.g. "kitchen", "custom_office").
     * Generated from name if not provided; immutable after creation for
     * seeded (isCustom: false) entries.
     */
    key: {
      type: String,
      required: [true, 'Category key is required.'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    /** Human-readable label shown in the UI (e.g. "Kitchen"). */
    name: {
      type: String,
      required: [true, 'Category display name is required.'],
      trim: true,
    },
    /**
     * false → seeded/built-in (cannot be deleted, key is read-only).
     * true  → created by a user at runtime.
     */
    isCustom: {
      type: Boolean,
      default: false,
    },
    /** Which user created it. null = seeded / shared for all users. */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    /** Lower number = appears earlier in the UI list. */
    sortOrder: {
      type: Number,
      default: 999,
    },
  },
  { timestamps: true }
);

workTypeCategorySchema.index({ isCustom: 1, createdBy: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// WorkType
// ─────────────────────────────────────────────────────────────────────────────

const workTypeSchema = new Schema(
  {
    /**
     * Slug (e.g. "kitchen-flooring", "custom_office-lighting").
     * Must be globally unique across all categories.
     */
    key: {
      type: String,
      required: [true, 'WorkType key is required.'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    /** Human-readable label (e.g. "Kitchen Flooring"). */
    name: {
      type: String,
      required: [true, 'WorkType display name is required.'],
      trim: true,
    },
    /** Foreign key → WorkTypeCategory.key */
    categoryKey: {
      type: String,
      required: [true, 'categoryKey is required.'],
      trim: true,
      lowercase: true,
    },
    /**
     * Drives how surfaces are measured in the calculator.
     *   square-foot  → area (width × height)
     *   linear-foot  → length only
     *   by-unit      → count of discrete items
     */
    measurementType: {
      type: String,
      enum: {
        values: ['square-foot', 'linear-foot', 'by-unit'],
        message: 'measurementType must be square-foot, linear-foot, or by-unit.',
      },
      default: 'square-foot',
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 999,
    },
  },
  { timestamps: true }
);

workTypeSchema.index({ categoryKey: 1, isCustom: 1 });
workTypeSchema.index({ categoryKey: 1, name: 1 }); // fast duplicate-name check

// ─────────────────────────────────────────────────────────────────────────────
// Subtype
// ─────────────────────────────────────────────────────────────────────────────

const subtypeSchema = new Schema(
  {
    /**
     * The display value stored on a work item (e.g. "Hardwood", "Porcelain").
     * Must be unique within the same workType.
     */
    value: {
      type: String,
      required: [true, 'Subtype value is required.'],
      trim: true,
    },
    /** Foreign key → WorkType.key */
    workTypeKey: {
      type: String,
      required: [true, 'workTypeKey is required.'],
      trim: true,
      lowercase: true,
    },
    /**
     * Denormalised FK → WorkTypeCategory.key.
     * Stored here so we can query "all subtypes for a category" without a join.
     */
    categoryKey: {
      type: String,
      required: [true, 'categoryKey is required.'],
      trim: true,
      lowercase: true,
    },
    /** When true, this subtype is pre-selected when the work type is chosen. */
    isDefault: {
      type: Boolean,
      default: false,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 999,
    },
  },
  { timestamps: true }
);

// Enforce uniqueness of value within a work type
subtypeSchema.index({ workTypeKey: 1, value: 1 }, { unique: true });
subtypeSchema.index({ workTypeKey: 1, isDefault: 1 });
subtypeSchema.index({ categoryKey: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Export all three models from this single file
// ─────────────────────────────────────────────────────────────────────────────

const WorkTypeCategory = mongoose.model('WorkTypeCategory', workTypeCategorySchema);
const WorkType         = mongoose.model('WorkType',         workTypeSchema);
const Subtype          = mongoose.model('Subtype',          subtypeSchema);

module.exports = { WorkTypeCategory, WorkType, Subtype };