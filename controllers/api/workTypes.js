// controllers/api/workTypes.js
/**
 * Work-Type Taxonomy Controller
 *
 * Handles the full hierarchy:
 *   WorkTypeCategory  →  WorkType  →  Subtype
 *
 * Rules enforced:
 *  - Seeded (isCustom: false) categories/workTypes cannot be deleted.
 *  - Any authenticated user can create a new Category, WorkType, or Subtype.
 *  - Custom entries are shared across users; createdBy is recorded for auditing.
 *  - Duplicate names/values within the same parent are rejected with 409.
 *  - Keys are auto-generated from names when not provided.
 *
 * NOTE: All three models now come from the single models/Taxonomy.js file.
 */

const { WorkTypeCategory, WorkType, Subtype } = require('../../models/Taxonomy');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom taxonomy entries are shared across users (any logged-in user can
 * pick them from the dropdown) but only the original creator may mutate
 * them. This helper enforces that ownership.
 *
 * The seed script sets createdBy = null on the built-ins; we treat null
 * createdBy as "system" and never user-mutable. That's already guarded by
 * isCustom === false elsewhere, but checking both here is defense in depth.
 */
function isOwner(doc, req) {
  if (!doc) return false;
  if (!doc.createdBy) return false; // system entry, never user-mutable
  return doc.createdBy.toString() === req.user._id.toString();
}

/** "My Custom Room" → "my-custom-room" */
function nameToKey(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Build the full taxonomy tree consumed by the frontend.
 *
 * Shape:
 * [
 *   {
 *     key, name, isCustom, sortOrder,
 *     workTypes: [
 *       { key, name, categoryKey, measurementType, isCustom, sortOrder,
 *         subtypes: [{ value, isDefault, isCustom, sortOrder }] }
 *     ]
 *   }
 * ]
 */
async function buildFullTree() {
  const [categories, workTypes, subtypes] = await Promise.all([
    WorkTypeCategory.find().sort({ sortOrder: 1, name: 1 }).lean(),
    WorkType.find().sort({ categoryKey: 1, sortOrder: 1, name: 1 }).lean(),
    Subtype.find().sort({ workTypeKey: 1, sortOrder: 1, value: 1 }).lean(),
  ]);

  const subtypesByWT = {};
  for (const s of subtypes) {
    (subtypesByWT[s.workTypeKey] ??= []).push(s);
  }

  const wtByCategory = {};
  for (const wt of workTypes) {
    (wtByCategory[wt.categoryKey] ??= []).push({
      ...wt,
      subtypes: subtypesByWT[wt.key] ?? [],
    });
  }

  return categories.map((cat) => ({
    ...cat,
    workTypes: wtByCategory[cat.key] ?? [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/work-types  — full taxonomy tree
// ─────────────────────────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const tree = await buildFullTree();
    res.json({ success: true, data: tree });
  } catch (err) {
    logger.error('❌ getAll error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/work-types/categories  — flat list of categories
// ─────────────────────────────────────────────────────────────────────────────
exports.getCategories = async (req, res) => {
  try {
    const categories = await WorkTypeCategory.find()
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/work-types/categories/:categoryKey  — one category + its children
// ─────────────────────────────────────────────────────────────────────────────
exports.getCategory = async (req, res) => {
  try {
    const { categoryKey } = req.params;
    const category = await WorkTypeCategory.findOne({ key: categoryKey }).lean();
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found.' });
    }

    const workTypes = await WorkType.find({ categoryKey })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    const wtKeys     = workTypes.map((wt) => wt.key);
    const subtypes   = await Subtype.find({ workTypeKey: { $in: wtKeys } })
      .sort({ workTypeKey: 1, sortOrder: 1 })
      .lean();

    const subtypesByWT = {};
    for (const s of subtypes) {
      (subtypesByWT[s.workTypeKey] ??= []).push(s);
    }

    res.json({
      success: true,
      data: {
        ...category,
        workTypes: workTypes.map((wt) => ({
          ...wt,
          subtypes: subtypesByWT[wt.key] ?? [],
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/work-types/categories  — create a custom category
// Body: { name, key? }
// ─────────────────────────────────────────────────────────────────────────────
exports.createCategory = async (req, res) => {
  try {
    const { name, key: rawKey } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required.' });
    }

    const trimmedName = name.trim();
    const key         = rawKey ? nameToKey(rawKey) : `custom_${nameToKey(trimmedName)}`;

    // ── Duplicate key check ──
    const existingByKey = await WorkTypeCategory.findOne({ key });
    if (existingByKey) {
      return res.status(409).json({
        success: false,
        error: `A category with key "${key}" already exists.`,
        field: 'key',
      });
    }

    // ── Duplicate name check (case-insensitive) ──
    const existingByName = await WorkTypeCategory.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
    });
    if (existingByName) {
      return res.status(409).json({
        success: false,
        error: `A category named "${trimmedName}" already exists.`,
        field: 'name',
      });
    }

    const category = await WorkTypeCategory.create({
      key,
      name: trimmedName,
      isCustom: true,
      createdBy: req.user._id,
      sortOrder: 999,
    });

    logger.log(`✅ Created custom category: "${category.name}" (${category.key})`);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    logger.error('❌ createCategory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/work-types/categories/:categoryKey  — rename a category
// Body: { name }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCategory = async (req, res) => {
  try {
    const { categoryKey } = req.params;
    const { name }        = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required.' });
    }

    const trimmedName = name.trim();
    const category    = await WorkTypeCategory.findOne({ key: categoryKey });
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found.' });
    }
    if (!category.isCustom) {
      return res.status(403).json({
        success: false,
        error: 'Built-in categories cannot be modified.',
      });
    }
    if (!isOwner(category, req)) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit categories you created.',
      });
    }

    // ── Duplicate name check (exclude self) ──
    const conflict = await WorkTypeCategory.findOne({
      name:  { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      key:   { $ne: categoryKey },
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: `A category named "${trimmedName}" already exists.`,
        field: 'name',
      });
    }

    category.name = trimmedName;
    await category.save();

    logger.log(`✏️  Renamed category "${categoryKey}" → "${trimmedName}"`);
    res.json({ success: true, data: category });
  } catch (err) {
    logger.error('❌ updateCategory error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/work-types/categories/:categoryKey  — delete a CUSTOM category
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryKey } = req.params;
    const category = await WorkTypeCategory.findOne({ key: categoryKey });

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found.' });
    }
    if (!category.isCustom) {
      return res.status(403).json({
        success: false,
        error: 'Built-in categories cannot be deleted.',
      });
    }
    if (!isOwner(category, req)) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete categories you created.',
      });
    }

    // Cascade: remove all work types and their subtypes
    const workTypes = await WorkType.find({ categoryKey }).lean();
    const wtKeys    = workTypes.map((w) => w.key);
    await Subtype.deleteMany({ workTypeKey: { $in: wtKeys } });
    await WorkType.deleteMany({ categoryKey });
    await WorkTypeCategory.deleteOne({ key: categoryKey });

    logger.log(
      `🗑️  Deleted category "${categoryKey}" (${wtKeys.length} work types cascaded)`,
    );
    res.json({ success: true, message: 'Category and all its children deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/work-types/categories/:categoryKey/work-types  — add a work type
// Body: { name, key?, measurementType? }
// ─────────────────────────────────────────────────────────────────────────────
exports.createWorkType = async (req, res) => {
  try {
    const { categoryKey }                    = req.params;
    const { name, key: rawKey, measurementType } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Work type name is required.' });
    }

    const category = await WorkTypeCategory.findOne({ key: categoryKey });
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found.' });
    }

    const trimmedName = name.trim();
    const key         = rawKey ? nameToKey(rawKey) : `${categoryKey}-${nameToKey(trimmedName)}`;

    // ── Duplicate key check (global) ──
    const existingByKey = await WorkType.findOne({ key });
    if (existingByKey) {
      return res.status(409).json({
        success: false,
        error: `A work type with key "${key}" already exists.`,
        field: 'key',
      });
    }

    // ── Duplicate name check within this category (case-insensitive) ──
    const existingByName = await WorkType.findOne({
      categoryKey,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
    });
    if (existingByName) {
      return res.status(409).json({
        success: false,
        error: `"${trimmedName}" already exists under the "${category.name}" category.`,
        field: 'name',
        existingKey: existingByName.key,
      });
    }

    const validMeasurements = ['square-foot', 'linear-foot', 'by-unit'];
    const mt = validMeasurements.includes(measurementType) ? measurementType : 'square-foot';

    const workType = await WorkType.create({
      key,
      name: trimmedName,
      categoryKey,
      measurementType: mt,
      isCustom: true,
      createdBy: req.user._id,
      sortOrder: 999,
    });

    logger.log(`✅ Created work type: "${workType.name}" (${workType.key}) → "${categoryKey}"`);
    res.status(201).json({ success: true, data: workType });
  } catch (err) {
    logger.error('❌ createWorkType error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/work-types/work-types/:workTypeKey  — edit a work type
// Body: { name?, measurementType? }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateWorkType = async (req, res) => {
  try {
    const { workTypeKey }          = req.params;
    const { name, measurementType } = req.body;

    const workType = await WorkType.findOne({ key: workTypeKey });
    if (!workType) {
      return res.status(404).json({ success: false, error: 'Work type not found.' });
    }
    if (!workType.isCustom) {
      return res.status(403).json({
        success: false,
        error: 'Built-in work types cannot be modified.',
      });
    }
    if (!isOwner(workType, req)) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit work types you created.',
      });
    }

    const validMeasurements = ['square-foot', 'linear-foot', 'by-unit'];

    if (name?.trim()) {
      const trimmedName = name.trim();

      // ── Duplicate name within same category (exclude self) ──
      const conflict = await WorkType.findOne({
        categoryKey: workType.categoryKey,
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
        key: { $ne: workTypeKey },
      });
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: `"${trimmedName}" already exists in this category.`,
          field: 'name',
        });
      }

      workType.name = trimmedName;
    }

    if (measurementType && validMeasurements.includes(measurementType)) {
      workType.measurementType = measurementType;
    }

    await workType.save();
    logger.log(`✏️  Updated work type "${workTypeKey}"`);
    res.json({ success: true, data: workType });
  } catch (err) {
    logger.error('❌ updateWorkType error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/work-types/work-types/:workTypeKey  — delete a CUSTOM work type
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteWorkType = async (req, res) => {
  try {
    const { workTypeKey } = req.params;
    const workType = await WorkType.findOne({ key: workTypeKey });

    if (!workType) {
      return res.status(404).json({ success: false, error: 'Work type not found.' });
    }
    if (!workType.isCustom) {
      return res.status(403).json({
        success: false,
        error: 'Built-in work types cannot be deleted.',
      });
    }
    if (!isOwner(workType, req)) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete work types you created.',
      });
    }

    await Subtype.deleteMany({ workTypeKey });
    await WorkType.deleteOne({ key: workTypeKey });

    logger.log(`🗑️  Deleted work type "${workTypeKey}"`);
    res.json({ success: true, message: 'Work type and its subtypes deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/work-types/work-types/:workTypeKey/subtypes
// ─────────────────────────────────────────────────────────────────────────────
exports.getSubtypes = async (req, res) => {
  try {
    const { workTypeKey } = req.params;
    const subtypes = await Subtype.find({ workTypeKey })
      .sort({ sortOrder: 1, value: 1 })
      .lean();
    res.json({ success: true, data: subtypes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/work-types/work-types/:workTypeKey/subtypes  — add a subtype
// Body: { value, isDefault? }
// ─────────────────────────────────────────────────────────────────────────────
exports.createSubtype = async (req, res) => {
  try {
    const { workTypeKey }    = req.params;
    const { value, isDefault } = req.body;

    if (!value?.trim()) {
      return res.status(400).json({ success: false, error: 'Subtype value is required.' });
    }

    const trimmedValue = value.trim();
    const workType     = await WorkType.findOne({ key: workTypeKey });
    if (!workType) {
      return res.status(404).json({ success: false, error: 'Work type not found.' });
    }

    // ── Duplicate check (case-insensitive) ──
    const existing = await Subtype.findOne({
      workTypeKey,
      value: { $regex: new RegExp(`^${trimmedValue}$`, 'i') },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `"${trimmedValue}" already exists for this work type.`,
        field: 'value',
      });
    }

    if (isDefault) {
      await Subtype.updateMany({ workTypeKey, isDefault: true }, { $set: { isDefault: false } });
    }

    const subtype = await Subtype.create({
      value: trimmedValue,
      workTypeKey,
      categoryKey: workType.categoryKey,
      isDefault:   !!isDefault,
      isCustom:    true,
      createdBy:   req.user._id,
      sortOrder:   999,
    });

    logger.log(`✅ Created subtype "${subtype.value}" → "${workTypeKey}"`);
    res.status(201).json({ success: true, data: subtype });
  } catch (err) {
    logger.error('❌ createSubtype error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/work-types/work-types/:workTypeKey/subtypes/:subtypeId  — edit
// Body: { value }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateSubtype = async (req, res) => {
  try {
    const { workTypeKey, subtypeId } = req.params;
    const { value }                  = req.body;

    if (!value?.trim()) {
      return res.status(400).json({ success: false, error: 'Subtype value is required.' });
    }

    const trimmedValue = value.trim();
    const subtype      = await Subtype.findById(subtypeId);
    if (!subtype || subtype.workTypeKey !== workTypeKey) {
      return res.status(404).json({ success: false, error: 'Subtype not found.' });
    }
    if (!subtype.isCustom) {
      return res.status(403).json({
        success: false,
        error: 'Built-in subtypes cannot be modified.',
      });
    }
    if (!isOwner(subtype, req)) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit subtypes you created.',
      });
    }

    // ── Duplicate check (exclude self) ──
    const conflict = await Subtype.findOne({
      workTypeKey,
      value: { $regex: new RegExp(`^${trimmedValue}$`, 'i') },
      _id:   { $ne: subtypeId },
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: `"${trimmedValue}" already exists for this work type.`,
        field: 'value',
      });
    }

    subtype.value = trimmedValue;
    await subtype.save();

    logger.log(`✏️  Updated subtype "${subtypeId}" → "${trimmedValue}"`);
    res.json({ success: true, data: subtype });
  } catch (err) {
    logger.error('❌ updateSubtype error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/work-types/work-types/:workTypeKey/subtypes/:subtypeId
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteSubtype = async (req, res) => {
  try {
    const { subtypeId } = req.params;
    const subtype = await Subtype.findById(subtypeId);

    if (!subtype) {
      return res.status(404).json({ success: false, error: 'Subtype not found.' });
    }
    if (!subtype.isCustom) {
      return res.status(403).json({
        success: false,
        error: 'Built-in subtypes cannot be deleted.',
      });
    }
    if (!isOwner(subtype, req)) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete subtypes you created.',
      });
    }

    await Subtype.deleteOne({ _id: subtypeId });
    logger.log(`🗑️  Deleted subtype "${subtype.value}" from "${subtype.workTypeKey}"`);
    res.json({ success: true, message: 'Subtype deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/work-types/work-types/:workTypeKey/subtypes/:subtypeId/set-default
// ─────────────────────────────────────────────────────────────────────────────
exports.setDefaultSubtype = async (req, res) => {
  try {
    const { workTypeKey, subtypeId } = req.params;

    const subtype = await Subtype.findById(subtypeId);
    if (!subtype || subtype.workTypeKey !== workTypeKey) {
      return res.status(404).json({ success: false, error: 'Subtype not found.' });
    }

    await Subtype.updateMany({ workTypeKey, isDefault: true }, { $set: { isDefault: false } });
    subtype.isDefault = true;
    await subtype.save();

    res.json({ success: true, data: subtype });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};