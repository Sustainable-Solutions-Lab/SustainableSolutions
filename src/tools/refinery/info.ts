/** Short explanations behind the (i) buttons and in the node cards. */
import type { UnitId } from './data.ts';

export const UNIT_INFO: Record<UnitId, string> = {
  cdu: 'Heats crude to about 370 °C and separates it by boiling point into gases, naphtha, kerosene, gasoil and a heavy residue. The vacuum unit re-distills that residue at low pressure into vacuum gas oil, the main cracker feed, and vacuum residue.',
  coker: 'Cracks vacuum residue with heat alone. Lighter liquids distill off and solid petroleum coke is left. A coker is what lets a refinery buy cheaper heavy crude.',
  hck: 'Cracks vacuum gas oil with hydrogen at 100 to 200 bar into clean jet, diesel and naphtha. More flexible than an FCC, but it uses a lot of hydrogen.',
  lube: 'Turns the best vacuum gas oil into lubricant base oil: hydrocracking to clean it up, then catalytic dewaxing so the oil stays fluid in the cold. Base oil sells well above fuels and lubricant demand lasts longer than fuel demand. Takes gas oil ahead of the hydrocracker and FCC.',
  fcc: 'Cracks vacuum gas oil over hot powdered catalyst in a few seconds. Makes mostly gasoline, plus light cycle oil, propylene and LPG. Coke left on the catalyst is burned off in the regenerator, one of a refinery’s largest CO₂ sources.',
  ref: 'Turns low-octane heavy naphtha into high-octane reformate, rich in aromatics, and releases hydrogen. The refinery’s main in-house hydrogen source.',
  isom: 'Rearranges light naphtha into branched molecules with higher octane.',
  alky: 'Joins the FCC’s propylene and butylenes with isobutane into alkylate, a clean, high-octane gasoline component.',
  kht: 'Removes sulfur from kerosene so it can be sold as jet fuel. Uses a little hydrogen. Kerosene it cannot take goes to the diesel hydrotreater.',
  dht: 'Removes sulfur from gasoil, light cycle oil and any spare kerosene to make diesel below 15 ppm sulfur. Can co-process a few percent of plant oil into renewable diesel.',
  scr: 'Thermal cracking with steam at about 850 °C, aimed at olefins. On naphtha it makes about 30% ethylene and 15% propylene, plus butadiene and pyrolysis gasoline. Nearly all its CO₂ comes from the fuel burned in its furnaces.',
  arom: 'Extracts benzene, toluene and xylenes (BTX) from reformate and pyrolysis gasoline. The leftover raffinate is sold as naphtha.',
};

export const LEVER_INFO = {
  throughput: 'How much crude the refinery runs. It cannot exceed the crude unit’s capacity. Running less is costly, because fixed costs are spread over fewer barrels.',
  slate: 'Light sweet crude yields more naphtha and distillate; heavy sour crude yields more residue but costs less. Heavy crude pays only with conversion hardware (a coker, a hydrocracker) to upgrade the residue.',
  crudePrices: 'Heavy sour crude sells at a discount to light sweet. The discount is what conversion hardware earns.',
  presets: 'Each preset sets which units exist and how big they are, for a 260 kb/d crude unit. Change any unit under “Units and capacities”.',
  cuts: 'Operators can move the boundary between neighbouring cuts by about ±20 °C. The material near a boundary, the swing cut, shifts a few percent of the barrel between products. It is the cheapest lever a refinery has.',
  fcc: 'Severity and catalyst set the FCC’s yields. Max distillate runs cooler and makes more light cycle oil for diesel. Max propylene runs hotter with ZSM-5 additive and makes up to about 15% propylene.',
  hck: 'Recycle rate and catalyst swing the hydrocracker’s output between jet, diesel and naphtha.',
  refSeverity: 'Running the reformer harder raises the octane of the reformate and makes more hydrogen, but turns more naphtha into gas.',
  refToArom: 'Reformate can go to the gasoline pool or to the aromatics complex for BTX, not both. Taking it out of gasoline costs octane.',
  naphToCracker: 'Naphtha can go to fuels (isomerization, the reformer, gasoline) or to the steam cracker for olefins. Integration with chemicals is a refinery’s strongest defence against falling fuel demand.',
  h2: 'Hydrotreaters and the hydrocracker use more hydrogen than the reformer makes. The gap comes from a hydrogen plant: steam methane reforming (about 9 t CO₂ per t H₂), the same with carbon capture (about 60% captured, at $55/t), or electrolysis on clean power (about 55 MWh per t H₂, plus the cost of a new electrolyzer).',
  coproc: 'Up to about 10% plant oil can be fed to an existing diesel hydrotreater alongside fossil gasoil. It becomes renewable diesel, but needs about four times as much hydrogen. Its CO₂ is biogenic and not counted.',
  pricePresets: '“2023-like” is near 2023 US Gulf Coast spot prices, a strong year for refiners. “Net-zero world” is made up: road fuel demand in steep decline, so crack spreads collapse; chemicals hold up; carbon costs $150/t.',
  carbon: 'Charged on the refinery’s direct (scope 1) emissions. Purchased power is shown but not charged.',
  grid: 'CO₂ per MWh of purchased power. Sets the indirect emissions only. Electrolysis is assumed to run on contracted clean power.',
  octane: 'Gasoline is blended from many streams. We average their research octane (RON) by mass and compare it with a 91 spec. Off-spec gasoline sells at a discount of $1.50/bbl per point short. Reformer severity, isomerization and alkylation raise octane.',
} as const;

export const ABOUT_NUMBERS = 'A teaching model, not a refinery simulator. Yields, energy use and costs are stylized textbook values and prices are round numbers. It balances mass and money for one day of steady operation, with no optimizer: each stream goes down a fixed order of outlets and spills to the next when a unit is full. Emissions are the refinery’s own, about 5 to 10% of the life-cycle emissions of the fuels it makes.';
