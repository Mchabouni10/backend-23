// scripts/seedWorkTypes.js
/**
 * Run once to populate WorkTypeCategory, WorkType, and Subtype collections.
 *
 * Usage:
 *   node scripts/seedWorkTypes.js
 *
 * Safe to re-run — uses upsert so it won't duplicate data.
 */

require('dotenv').config();
require('../config/database');

const { WorkTypeCategory, WorkType, Subtype } = require('../models/Taxonomy');

// ---------------------------------------------------------------------------
// Full taxonomy — sourced directly from project.js VALID_WORK_TYPES
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'kitchen',       name: 'Kitchen',       sortOrder: 1  },
  { key: 'bathroom',      name: 'Bathroom',      sortOrder: 2  },
  { key: 'living-room',   name: 'Living Room',   sortOrder: 3  },
  { key: 'bedroom',       name: 'Bedroom',       sortOrder: 4  },
  { key: 'dining-room',   name: 'Dining Room',   sortOrder: 5  },
  { key: 'hallway',       name: 'Hallway',       sortOrder: 6  },
  { key: 'laundry',       name: 'Laundry',       sortOrder: 7  },
  { key: 'basement',      name: 'Basement',      sortOrder: 8  },
  { key: 'garage',        name: 'Garage',        sortOrder: 9  },
  { key: 'walk-in-closet',name: 'Walk-In Closet',sortOrder: 10 },
  { key: 'exterior',      name: 'Exterior',      sortOrder: 11 },
  { key: 'electricity',   name: 'Electricity',   sortOrder: 12 },
  { key: 'plumbing',      name: 'Plumbing',      sortOrder: 13 },
  { key: 'general',       name: 'General',       sortOrder: 14 },
];

// ---------------------------------------------------------------------------
// Helper: decide measurementType from the work type key
// Mirrors the logic in WorkTypeContext.jsx getMeasurementType()
// ---------------------------------------------------------------------------
function getMeasurementType(key) {
  // By-unit items
  if (
    key.includes('outlet') || key.includes('switch') ||
    key.includes('appliance') || key.includes('fixture') ||
    key.includes('sink') || key.includes('toilet') ||
    key.includes('door') || key.includes('window') ||
    key.includes('fan') || key.includes('mirror') ||
    key.includes('hardware') || key.includes('organizer') ||
    key.includes('lighting') || key.includes('faucet') ||
    key.includes('hood') || key.includes('garbage-disposal') ||
    key.includes('pantry-organizer') || key.includes('shower-door') ||
    key.includes('medicine-cabinet') || key.includes('towel-bars') ||
    key.includes('grab-bars') || key.includes('towel-warmer') ||
    key.includes('bathtub') || key.includes('fireplace') ||
    key.includes('tv-mount') || key.includes('ceiling-fan') ||
    key.includes('speaker') || key.includes('mailbox') ||
    key.includes('gate') || key.includes('smoke-detector') ||
    key.includes('thermostat') || key.includes('sump-pump') ||
    key.includes('water-heater') || key.includes('panel-upgrade') ||
    key.includes('circuit-breaker') || key.includes('garage-door') ||
    key.includes('bike-rack') || key.includes('shelf') ||
    key.includes('shelves') || key.includes('bench') ||
    key.includes('island') || key.includes('washer') ||
    key.includes('dryer') || key.includes('shoe-rack') ||
    key.includes('valet-rod') || key.includes('storage-bins') ||
    key.includes('ironing-station') || key.includes('hanging-rods') ||
    key.includes('serving-hutch') || key.includes('console-table') ||
    key.includes('wall-art-frame') || key.includes('chandelier') ||
    key.includes('mantle') || key.includes('vent-cover') ||
    key.includes('access-panel') || key.includes('ceiling-medallion') ||
    key.includes('house-number') || key.includes('downspout') ||
    key.includes('shutter') || key.includes('workbench') ||
    key.includes('epoxy-coating') || key.includes('home-theater') ||
    key.includes('built-in-bar') || key.includes('egress-window') ||
    key.includes('staircase') || key.includes('handrail') ||
    key.includes('storage-rack') || key.includes('folding-table') ||
    key.includes('built-in-bench') || key.includes('built-in-drawer') ||
    key.includes('built-in-cabinet') || key.includes('display-cabinet') ||
    key.includes('built-in-buffet') || key.includes('cable-management') ||
    key.includes('window-treatments') || key.includes('smart-home') ||
    key.includes('surge-protector') || key.includes('grounding') ||
    key.includes('ventilation-fan') || key.includes('tool-storage') ||
    key.includes('wall-organizer') || key.includes('ceiling-storage') ||
    key.includes('drop-ceiling') || key.includes('dryer-vent') ||
    key.includes('utility-sink-faucet') || key.includes('runner')
  ) {
    return 'by-unit';
  }

  // Linear-foot items
  if (
    key.includes('trim') || key.includes('molding') ||
    key.includes('baseboard') || key.includes('crown') ||
    key.includes('edge') || key.includes('strip') ||
    key.includes('wainscoting') || key.includes('chair-rail') ||
    key.includes('toe-kicks') || key.includes('railing') ||
    key.includes('soffit') || key.includes('fascia') ||
    key.includes('gutters') || key.includes('landscape-edging') ||
    key.includes('foundation-trim') || key.includes('pipe-covering') ||
    key.includes('conduit-covering') || key.includes('rods') ||
    key.includes('picture-ledge') || key.includes('shower-ledge') ||
    key.includes('shower-trim') || key.includes('tub-surround') ||
    key.includes('window-sills') || key.includes('built-in-shelving') ||
    key.includes('closet-rods') || key.includes('closet-shelves') ||
    key.includes('cable-management')
  ) {
    return 'linear-foot';
  }

  // Default: square-foot
  return 'square-foot';
}

// ---------------------------------------------------------------------------
// All work types — sourced from project.js VALID_WORK_TYPES
// ---------------------------------------------------------------------------

const WORK_TYPES_BY_CATEGORY = {
  kitchen: ['kitchen-flooring','kitchen-tiles','kitchen-backsplash','kitchen-ceiling','kitchen-walls','kitchen-countertop-surface','kitchen-cabinet-doors','kitchen-island-top','kitchen-cabinets','kitchen-countertops','kitchen-trim','kitchen-island-edge','kitchen-crown-molding','kitchen-toe-kicks','kitchen-cabinet-lighting','kitchen-under-cabinet-strips','kitchen-sink','kitchen-faucet','kitchen-lighting','kitchen-appliance','kitchen-hood','kitchen-garbage-disposal','kitchen-cabinet-hardware','kitchen-outlet','kitchen-switch','kitchen-pantry-organizer'],
  bathroom: ['bathroom-flooring','bathroom-tiles','bathroom-shower-tiles','bathroom-walls','bathroom-ceiling','bathroom-shower-floor','bathroom-vanity-top','bathroom-mirror-wall','bathroom-vanity','bathroom-trim','bathroom-wainscoting','bathroom-shower-trim','bathroom-tub-surround','bathroom-chair-rail','bathroom-towel-bars','bathroom-grab-bars','bathroom-faucet','bathroom-shower-faucet','bathroom-fan','bathroom-towel-warmer','bathroom-toilet','bathroom-mirror','bathroom-lighting','bathroom-bathtub','bathroom-shower-ledge','bathroom-medicine-cabinet','bathroom-outlet','bathroom-shower-door'],
  'living-room': ['living-room-flooring','living-room-walls','living-room-ceiling','living-room-accent-wall','living-room-fireplace-surround','living-room-built-in-shelving','living-room-window-treatments','living-room-trim','living-room-crown-molding','living-room-wainscoting','living-room-chair-rail','living-room-baseboard','living-room-picture-ledge','living-room-mantle','living-room-cable-management','living-room-lighting','living-room-fireplace','living-room-ceiling-fan','living-room-tv-mount','living-room-outlet','living-room-switch','living-room-window','living-room-door','living-room-built-in-cabinet','living-room-speaker'],
  bedroom: ['bedroom-flooring','bedroom-walls','bedroom-ceiling','bedroom-closet-interior','bedroom-accent-wall','bedroom-window-treatments','bedroom-headboard-wall','bedroom-trim','bedroom-closet-shelves','bedroom-crown-molding','bedroom-baseboard','bedroom-chair-rail','bedroom-closet-rods','bedroom-window-sills','bedroom-built-in-bench','bedroom-lighting','bedroom-ceiling-fan','bedroom-window','bedroom-closet-organizer','bedroom-door','bedroom-outlet','bedroom-switch','bedroom-closet-door','bedroom-built-in-drawer','bedroom-mirror'],
  exterior: ['exterior-deck','exterior-siding','exterior-painting','exterior-roofing','exterior-patio','exterior-driveway','exterior-walkway','exterior-retaining-wall','exterior-fencing','exterior-trim','exterior-gutters','exterior-deck-railing','exterior-soffit','exterior-fascia','exterior-foundation-trim','exterior-landscape-edging','exterior-door','exterior-window','exterior-lighting','exterior-mailbox','exterior-gate','exterior-outlet','exterior-shutter','exterior-downspout','exterior-vent','exterior-house-number'],
  garage: ['garage-flooring','garage-walls','garage-ceiling','garage-door-opener','garage-storage-shelves','garage-workbench','garage-cabinets','garage-lighting','garage-outlet','garage-insulation','garage-epoxy-coating','garage-door','garage-window','garage-ventilation','garage-wall-organizer','garage-ceiling-storage','garage-bike-rack','garage-tool-storage'],
  electricity: ['electricity-wiring','electricity-panel-upgrade','electricity-circuit-breaker','electricity-outlet-installation','electricity-lighting-fixture','electricity-ceiling-fan-installation','electricity-switch-installation','electricity-surge-protector','electricity-grounding-system','electricity-smoke-detector-installation','electricity-smart-home-integration','electricity-exterior-lighting','electricity-appliance-circuit'],
  plumbing: ['plumbing-pipe-installation','plumbing-faucet-installation','plumbing-toilet-installation','plumbing-shower-installation','plumbing-sink-installation','plumbing-water-heater','plumbing-drain-cleaning','plumbing-leak-repair','plumbing-valve-replacement','plumbing-sump-pump','plumbing-water-line','plumbing-sewer-line'],
  hallway: ['hallway-flooring','hallway-walls','hallway-ceiling','hallway-lighting','hallway-trim','hallway-baseboard','hallway-crown-molding','hallway-wainscoting','hallway-door','hallway-runner','hallway-wall-art-frame','hallway-console-table','hallway-mirror'],
  general: ['general-drywall','general-painting','general-flooring','general-ceiling','general-wall-repair','general-insulation','general-paneling','general-wallpaper','general-trim','general-molding','general-chair-rail','general-baseboard','general-door-frame','general-window-frame','general-pipe-covering','general-conduit-covering','general-lighting','general-window','general-door','general-outlet','general-switch','general-smoke-detector','general-thermostat','general-ceiling-medallion','general-vent-cover','general-access-panel'],
  laundry: ['laundry-flooring','laundry-walls','laundry-ceiling','laundry-cabinets','laundry-washer','laundry-dryer','laundry-sink','laundry-shelving','laundry-folding-table','laundry-countertop','laundry-lighting','laundry-outlet','laundry-dryer-vent','laundry-trim','laundry-baseboard','laundry-crown-molding','laundry-wainscoting','laundry-door','laundry-utility-sink-faucet','laundry-storage-rack','laundry-ironing-station','laundry-hanging-rods','laundry-ventilation-fan'],
  'dining-room': ['dining-room-flooring','dining-room-walls','dining-room-ceiling','dining-room-chandelier','dining-room-built-in-buffet','dining-room-display-cabinet','dining-room-window-treatments','dining-room-trim','dining-room-crown-molding','dining-room-wainscoting','dining-room-chair-rail','dining-room-baseboard','dining-room-lighting','dining-room-outlet','dining-room-switch','dining-room-window','dining-room-door','dining-room-accent-wall','dining-room-wall-art-frame','dining-room-ceiling-medallion','dining-room-serving-hutch'],
  basement: ['basement-flooring','basement-walls','basement-ceiling','basement-waterproofing','basement-egress-window','basement-sump-pump','basement-drop-ceiling','basement-insulation','basement-lighting','basement-trim','basement-baseboard','basement-staircase','basement-handrail','basement-storage-shelves','basement-built-in-bar','basement-home-theater','basement-outlet','basement-switch','basement-ventilation','basement-fireplace','basement-accent-wall'],
  'walk-in-closet': ['walk-in-closet-flooring','walk-in-closet-walls','walk-in-closet-ceiling','walk-in-closet-shelves','walk-in-closet-rods','walk-in-closet-drawers','walk-in-closet-organizer','walk-in-closet-lighting','walk-in-closet-mirror','walk-in-closet-door','walk-in-closet-bench','walk-in-closet-island','walk-in-closet-shoe-rack','walk-in-closet-trim','walk-in-closet-baseboard','walk-in-closet-crown-molding','walk-in-closet-accent-wall','walk-in-closet-carpet','walk-in-closet-storage-bins','walk-in-closet-valet-rod'],
};

// ---------------------------------------------------------------------------
// Helper: turn "kitchen-cabinet-hardware" → "Kitchen Cabinet Hardware"
// ---------------------------------------------------------------------------
function keyToName(key) {
  return key
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Seed subtypes for common work types
// ---------------------------------------------------------------------------
const SUBTYPES = {
  // Flooring
  'kitchen-flooring':        [{ value: 'Hardwood', isDefault: true }, { value: 'Tile' }, { value: 'Vinyl Plank' }, { value: 'Laminate' }],
  'bathroom-flooring':       [{ value: 'Porcelain Tile', isDefault: true }, { value: 'Ceramic Tile' }, { value: 'Vinyl' }, { value: 'Marble' }],
  'living-room-flooring':    [{ value: 'Hardwood', isDefault: true }, { value: 'Carpet' }, { value: 'Vinyl Plank' }, { value: 'Laminate' }],
  'bedroom-flooring':        [{ value: 'Carpet', isDefault: true }, { value: 'Hardwood' }, { value: 'Vinyl Plank' }, { value: 'Laminate' }],
  'basement-flooring':       [{ value: 'Vinyl Plank', isDefault: true }, { value: 'Epoxy' }, { value: 'Carpet' }, { value: 'Tile' }],
  'garage-flooring':         [{ value: 'Epoxy Coating', isDefault: true }, { value: 'Concrete Sealer' }, { value: 'Tile' }],
  'hallway-flooring':        [{ value: 'Hardwood', isDefault: true }, { value: 'Tile' }, { value: 'Vinyl Plank' }],
  'laundry-flooring':        [{ value: 'Tile', isDefault: true }, { value: 'Vinyl' }, { value: 'Laminate' }],
  'dining-room-flooring':    [{ value: 'Hardwood', isDefault: true }, { value: 'Tile' }, { value: 'Vinyl Plank' }],
  'walk-in-closet-flooring': [{ value: 'Carpet', isDefault: true }, { value: 'Hardwood' }, { value: 'Vinyl Plank' }],
  'walk-in-closet-carpet':   [{ value: 'Plush', isDefault: true }, { value: 'Berber' }, { value: 'Frieze' }],

  // Tiles
  'kitchen-tiles':           [{ value: 'Ceramic', isDefault: true }, { value: 'Porcelain' }, { value: 'Natural Stone' }],
  'kitchen-backsplash':      [{ value: 'Subway Tile', isDefault: true }, { value: 'Mosaic' }, { value: 'Glass' }, { value: 'Stone' }],
  'bathroom-tiles':          [{ value: 'Ceramic', isDefault: true }, { value: 'Porcelain' }, { value: 'Marble' }, { value: 'Natural Stone' }],
  'bathroom-shower-tiles':   [{ value: 'Porcelain', isDefault: true }, { value: 'Ceramic' }, { value: 'Marble' }, { value: 'Glass' }],
  'bathroom-shower-floor':   [{ value: 'Mosaic Tile', isDefault: true }, { value: 'Porcelain' }, { value: 'Pebble' }],

  // Walls / Painting
  'kitchen-walls':           [{ value: 'Paint', isDefault: true }, { value: 'Wallpaper' }, { value: 'Tile' }],
  'bathroom-walls':          [{ value: 'Paint', isDefault: true }, { value: 'Tile' }, { value: 'Wallpaper' }],
  'living-room-walls':       [{ value: 'Paint', isDefault: true }, { value: 'Wallpaper' }, { value: 'Shiplap' }, { value: 'Panel' }],
  'bedroom-walls':           [{ value: 'Paint', isDefault: true }, { value: 'Wallpaper' }, { value: 'Shiplap' }],
  'basement-walls':          [{ value: 'Paint', isDefault: true }, { value: 'Drywall' }, { value: 'Panel' }, { value: 'Tile' }],
  'garage-walls':            [{ value: 'Paint', isDefault: true }, { value: 'Drywall' }, { value: 'Panel' }],
  'general-painting':        [{ value: 'Interior', isDefault: true }, { value: 'Exterior' }, { value: 'Ceiling' }, { value: 'Trim' }],
  'general-wallpaper':       [{ value: 'Vinyl', isDefault: true }, { value: 'Fabric' }, { value: 'Peel & Stick' }],
  'exterior-painting':       [{ value: 'Latex', isDefault: true }, { value: 'Oil-Based' }, { value: 'Elastomeric' }],

  // Countertops
  'kitchen-countertops':           [{ value: 'Quartz', isDefault: true }, { value: 'Granite' }, { value: 'Marble' }, { value: 'Laminate' }, { value: 'Butcher Block' }],
  'kitchen-countertop-surface':    [{ value: 'Quartz', isDefault: true }, { value: 'Granite' }, { value: 'Marble' }, { value: 'Laminate' }],
  'kitchen-island-top':            [{ value: 'Quartz', isDefault: true }, { value: 'Granite' }, { value: 'Butcher Block' }, { value: 'Marble' }],
  'bathroom-vanity-top':           [{ value: 'Quartz', isDefault: true }, { value: 'Marble' }, { value: 'Cultured Marble' }, { value: 'Granite' }],

  // Cabinets
  'kitchen-cabinets':        [{ value: 'Shaker', isDefault: true }, { value: 'Flat Panel' }, { value: 'Raised Panel' }, { value: 'Open Shelf' }],
  'kitchen-cabinet-doors':   [{ value: 'Shaker', isDefault: true }, { value: 'Flat Panel' }, { value: 'Raised Panel' }, { value: 'Glass Insert' }],
  'bathroom-vanity':         [{ value: 'Shaker', isDefault: true }, { value: 'Modern' }, { value: 'Traditional' }, { value: 'Floating' }],
  'laundry-cabinets':        [{ value: 'Upper Cabinets', isDefault: true }, { value: 'Base Cabinets' }, { value: 'Full Height' }],
  'garage-cabinets':         [{ value: 'Metal', isDefault: true }, { value: 'Wood' }, { value: 'Plastic' }],

  // Ceilings
  'kitchen-ceiling':         [{ value: 'Drywall', isDefault: true }, { value: 'Tray Ceiling' }, { value: 'Coffered' }],
  'bathroom-ceiling':        [{ value: 'Drywall', isDefault: true }, { value: 'Beadboard' }, { value: 'Tile' }],
  'living-room-ceiling':     [{ value: 'Drywall', isDefault: true }, { value: 'Tray Ceiling' }, { value: 'Coffered' }, { value: 'Vaulted' }],
  'bedroom-ceiling':         [{ value: 'Drywall', isDefault: true }, { value: 'Tray Ceiling' }, { value: 'Vaulted' }],
  'basement-ceiling':        [{ value: 'Drywall', isDefault: true }, { value: 'Drop Ceiling' }, { value: 'Exposed' }],
  'basement-drop-ceiling':   [{ value: 'Standard Grid', isDefault: true }, { value: 'Acoustic Tile' }, { value: 'Tin Tile' }],
  'garage-ceiling':          [{ value: 'Drywall', isDefault: true }, { value: 'Exposed' }, { value: 'Insulated Panel' }],

  // Trim / Molding
  'kitchen-trim':            [{ value: 'Painted MDF', isDefault: true }, { value: 'Wood' }, { value: 'PVC' }],
  'kitchen-crown-molding':   [{ value: 'MDF', isDefault: true }, { value: 'Wood' }, { value: 'Polyurethane' }],
  'bathroom-trim':           [{ value: 'Painted MDF', isDefault: true }, { value: 'Wood' }, { value: 'PVC' }],
  'living-room-trim':        [{ value: 'Painted MDF', isDefault: true }, { value: 'Wood' }, { value: 'PVC' }],
  'living-room-crown-molding': [{ value: 'MDF', isDefault: true }, { value: 'Wood' }, { value: 'Polyurethane' }],
  'bedroom-trim':            [{ value: 'Painted MDF', isDefault: true }, { value: 'Wood' }, { value: 'PVC' }],
  'general-trim':            [{ value: 'Painted MDF', isDefault: true }, { value: 'Wood' }, { value: 'PVC' }],
  'general-molding':         [{ value: 'MDF', isDefault: true }, { value: 'Wood' }, { value: 'Polyurethane' }],
  'general-baseboard':       [{ value: '3.5" Painted', isDefault: true }, { value: '5.5" Painted' }, { value: 'Wood' }],

  // Exterior
  'exterior-deck':           [{ value: 'Composite', isDefault: true }, { value: 'Pressure Treated Wood' }, { value: 'Hardwood' }, { value: 'PVC' }],
  'exterior-siding':         [{ value: 'Vinyl', isDefault: true }, { value: 'Fiber Cement' }, { value: 'Wood' }, { value: 'Stucco' }],
  'exterior-roofing':        [{ value: 'Asphalt Shingles', isDefault: true }, { value: 'Metal' }, { value: 'Tile' }, { value: 'Flat/TPO' }],
  'exterior-fencing':        [{ value: 'Wood', isDefault: true }, { value: 'Vinyl' }, { value: 'Aluminum' }, { value: 'Chain Link' }],
  'exterior-patio':          [{ value: 'Concrete', isDefault: true }, { value: 'Pavers' }, { value: 'Stamped Concrete' }, { value: 'Flagstone' }],

  // Plumbing
  'plumbing-pipe-installation': [{ value: 'PVC', isDefault: true }, { value: 'Copper' }, { value: 'PEX' }],
  'plumbing-water-heater':      [{ value: 'Tank Gas', isDefault: true }, { value: 'Tank Electric' }, { value: 'Tankless Gas' }, { value: 'Tankless Electric' }],

  // Electricity
  'electricity-wiring':           [{ value: 'Romex 12/2', isDefault: true }, { value: 'Romex 14/2' }, { value: 'Conduit' }],
  'electricity-lighting-fixture': [{ value: 'Recessed', isDefault: true }, { value: 'Surface Mount' }, { value: 'Pendant' }, { value: 'Track' }],

  // General
  'general-drywall':         [{ value: '1/2" Standard', isDefault: true }, { value: '5/8" Type X' }, { value: 'Moisture Resistant' }],
  'general-insulation':      [{ value: 'Batt Fiberglass', isDefault: true }, { value: 'Spray Foam' }, { value: 'Rigid Board' }, { value: 'Blown-In' }],
  'general-flooring':        [{ value: 'Hardwood', isDefault: true }, { value: 'Tile' }, { value: 'Vinyl Plank' }, { value: 'Carpet' }, { value: 'Laminate' }],
};

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------
async function seed() {
  console.log('🌱 Starting work-type taxonomy seed...\n');

  let catCount = 0;
  let wtCount = 0;
  let stCount = 0;

  // 1. Seed categories
  for (const cat of CATEGORIES) {
    await WorkTypeCategory.findOneAndUpdate(
      { key: cat.key },
      {
        $setOnInsert: {
          key: cat.key,
          name: cat.name,
          isCustom: false,
          createdBy: null,
          sortOrder: cat.sortOrder,
        },
      },
      { upsert: true, new: true },
    );
    catCount++;
  }
  console.log(`✅ Seeded ${catCount} categories`);

  // 2. Seed work types
  for (const [categoryKey, workTypeKeys] of Object.entries(WORK_TYPES_BY_CATEGORY)) {
    for (let i = 0; i < workTypeKeys.length; i++) {
      const key = workTypeKeys[i];
      await WorkType.findOneAndUpdate(
        { key },
        {
          $setOnInsert: {
            key,
            name: keyToName(key),
            categoryKey,
            measurementType: getMeasurementType(key),
            isCustom: false,
            createdBy: null,
            sortOrder: i + 1,
          },
        },
        { upsert: true, new: true },
      );
      wtCount++;
    }
  }
  console.log(`✅ Seeded ${wtCount} work types`);

  // 3. Seed subtypes
  for (const [workTypeKey, subtypes] of Object.entries(SUBTYPES)) {
    // Look up the categoryKey for this work type
    const wt = await WorkType.findOne({ key: workTypeKey }).lean();
    if (!wt) {
      console.warn(`  ⚠️  WorkType "${workTypeKey}" not found — skipping subtypes`);
      continue;
    }

    for (let i = 0; i < subtypes.length; i++) {
      const st = subtypes[i];
      await Subtype.findOneAndUpdate(
        { workTypeKey, value: st.value },
        {
          $setOnInsert: {
            value: st.value,
            workTypeKey,
            categoryKey: wt.categoryKey,
            isDefault: !!st.isDefault,
            isCustom: false,
            createdBy: null,
            sortOrder: i + 1,
          },
        },
        { upsert: true, new: true },
      );
      stCount++;
    }
  }
  console.log(`✅ Seeded ${stCount} subtypes`);

  console.log('\n🎉 Seed complete!');
  console.log(`   Categories : ${catCount}`);
  console.log(`   Work Types : ${wtCount}`);
  console.log(`   Subtypes   : ${stCount}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});