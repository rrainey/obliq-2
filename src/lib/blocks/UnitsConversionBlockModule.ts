// lib/blocks/UnitsConversionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Units Conversion Categories and their conversions
 */
export const UNITS_CONVERSION_CATALOG = {
  angle: {
    label: 'Angle',
    conversions: {
      'deg_to_rad': { label: 'deg -> rad', factor: 'M_PI / 180.0', description: 'Degrees to radians' },
      'rad_to_deg': { label: 'rad -> deg', factor: '180.0 / M_PI', description: 'Radians to degrees' },
      'rev_to_rad': { label: 'rev -> rad', factor: '2.0 * M_PI', description: 'Revolutions to radians' },
      'rev_to_deg': { label: 'rev -> deg', factor: '360.0', description: 'Revolutions to degrees' },
    }
  },
  temperature: {
    label: 'Temperature',
    conversions: {
      'c_to_f': { label: 'C -> F', expression: '(x) * 9.0/5.0 + 32.0', description: 'Celsius to Fahrenheit' },
      'f_to_c': { label: 'F -> C', expression: '((x) - 32.0) * 5.0/9.0', description: 'Fahrenheit to Celsius' },
      'c_to_k': { label: 'C -> K', expression: '(x) + 273.15', description: 'Celsius to Kelvin' },
      'k_to_c': { label: 'K -> C', expression: '(x) - 273.15', description: 'Kelvin to Celsius' },
      'f_to_r': { label: 'F -> R', expression: '(x) + 459.67', description: 'Fahrenheit to Rankine' },
      'r_to_f': { label: 'R -> F', expression: '(x) - 459.67', description: 'Rankine to Fahrenheit' },
    }
  },
  length: {
    label: 'Length',
    conversions: {
      'm_to_ft': { label: 'm -> ft', factor: '3.28084', description: 'Meters to feet' },
      'ft_to_m': { label: 'ft -> m', factor: '0.3048', description: 'Feet to meters' },
      'm_to_in': { label: 'm -> in', factor: '39.3701', description: 'Meters to inches' },
      'in_to_m': { label: 'in -> m', factor: '0.0254', description: 'Inches to meters' },
      'km_to_mi': { label: 'km -> mi', factor: '0.621371', description: 'Kilometers to miles' },
      'mi_to_km': { label: 'mi -> km', factor: '1.60934', description: 'Miles to kilometers' },
      'km_to_nmi': { label: 'km -> nmi', factor: '0.539957', description: 'Kilometers to nautical miles' },
      'nmi_to_km': { label: 'nmi -> km', factor: '1.852', description: 'Nautical miles to kilometers' },
    }
  },
  velocity: {
    label: 'Velocity',
    conversions: {
      'mps_to_fps': { label: 'm/s -> ft/s', factor: '3.28084', description: 'Meters/sec to feet/sec' },
      'fps_to_mps': { label: 'ft/s -> m/s', factor: '0.3048', description: 'Feet/sec to meters/sec' },
      'mps_to_kts': { label: 'm/s -> kts', factor: '1.94384', description: 'Meters/sec to knots' },
      'kts_to_mps': { label: 'kts -> m/s', factor: '0.514444', description: 'Knots to meters/sec' },
      'mps_to_mph': { label: 'm/s -> mph', factor: '2.23694', description: 'Meters/sec to mph' },
      'mph_to_mps': { label: 'mph -> m/s', factor: '0.44704', description: 'MPH to meters/sec' },
      'kmh_to_mph': { label: 'km/h -> mph', factor: '0.621371', description: 'km/h to mph' },
      'mph_to_kmh': { label: 'mph -> km/h', factor: '1.60934', description: 'MPH to km/h' },
    }
  },
  angular_velocity: {
    label: 'Angular Velocity',
    conversions: {
      'radps_to_degps': { label: 'rad/s -> deg/s', factor: '180.0 / M_PI', description: 'Radians/sec to degrees/sec' },
      'degps_to_radps': { label: 'deg/s -> rad/s', factor: 'M_PI / 180.0', description: 'Degrees/sec to radians/sec' },
      'radps_to_rpm': { label: 'rad/s -> rpm', factor: '60.0 / (2.0 * M_PI)', description: 'Radians/sec to RPM' },
      'rpm_to_radps': { label: 'rpm -> rad/s', factor: '2.0 * M_PI / 60.0', description: 'RPM to radians/sec' },
    }
  },
  acceleration: {
    label: 'Acceleration',
    conversions: {
      'mps2_to_fps2': { label: 'm/s2 -> ft/s2', factor: '3.28084', description: 'Meters/sec^2 to feet/sec^2' },
      'fps2_to_mps2': { label: 'ft/s2 -> m/s2', factor: '0.3048', description: 'Feet/sec^2 to meters/sec^2' },
      'mps2_to_g': { label: 'm/s2 -> g', factor: '1.0 / 9.80665', description: 'Meters/sec^2 to g' },
      'g_to_mps2': { label: 'g -> m/s2', factor: '9.80665', description: 'g to meters/sec^2' },
    }
  },
  mass: {
    label: 'Mass',
    conversions: {
      'kg_to_lbm': { label: 'kg -> lbm', factor: '2.20462', description: 'Kilograms to pounds-mass' },
      'lbm_to_kg': { label: 'lbm -> kg', factor: '0.453592', description: 'Pounds-mass to kilograms' },
      'kg_to_slug': { label: 'kg -> slug', factor: '0.0685218', description: 'Kilograms to slugs' },
      'slug_to_kg': { label: 'slug -> kg', factor: '14.5939', description: 'Slugs to kilograms' },
    }
  },
  force: {
    label: 'Force',
    conversions: {
      'n_to_lbf': { label: 'N -> lbf', factor: '0.224809', description: 'Newtons to pounds-force' },
      'lbf_to_n': { label: 'lbf -> N', factor: '4.44822', description: 'Pounds-force to Newtons' },
    }
  },
  pressure: {
    label: 'Pressure',
    conversions: {
      'pa_to_psi': { label: 'Pa -> psi', factor: '0.000145038', description: 'Pascals to PSI' },
      'psi_to_pa': { label: 'psi -> Pa', factor: '6894.76', description: 'PSI to Pascals' },
      'pa_to_atm': { label: 'Pa -> atm', factor: '9.8692e-6', description: 'Pascals to atmospheres' },
      'atm_to_pa': { label: 'atm -> Pa', factor: '101325.0', description: 'Atmospheres to Pascals' },
      'pa_to_inhg': { label: 'Pa -> inHg', factor: '0.0002953', description: 'Pascals to inches of mercury' },
      'inhg_to_pa': { label: 'inHg -> Pa', factor: '3386.39', description: 'Inches of mercury to Pascals' },
      'pa_to_mbar': { label: 'Pa -> mbar', factor: '0.01', description: 'Pascals to millibars' },
      'mbar_to_pa': { label: 'mbar -> Pa', factor: '100.0', description: 'Millibars to Pascals' },
    }
  },
  area: {
    label: 'Area',
    conversions: {
      'm2_to_ft2': { label: 'm2 -> ft2', factor: '10.7639', description: 'Square meters to square feet' },
      'ft2_to_m2': { label: 'ft2 -> m2', factor: '0.092903', description: 'Square feet to square meters' },
      'm2_to_in2': { label: 'm2 -> in2', factor: '1550.0', description: 'Square meters to square inches' },
      'in2_to_m2': { label: 'in2 -> m2', factor: '0.00064516', description: 'Square inches to square meters' },
      'km2_to_mi2': { label: 'km2 -> mi2', factor: '0.386102', description: 'Square km to square miles' },
      'mi2_to_km2': { label: 'mi2 -> km2', factor: '2.58999', description: 'Square miles to square km' },
      'ha_to_acre': { label: 'ha -> acre', factor: '2.47105', description: 'Hectares to acres' },
      'acre_to_ha': { label: 'acre -> ha', factor: '0.404686', description: 'Acres to hectares' },
    }
  },
  volume: {
    label: 'Volume',
    conversions: {
      'm3_to_ft3': { label: 'm3 -> ft3', factor: '35.3147', description: 'Cubic meters to cubic feet' },
      'ft3_to_m3': { label: 'ft3 -> m3', factor: '0.0283168', description: 'Cubic feet to cubic meters' },
      'l_to_gal': { label: 'L -> gal', factor: '0.264172', description: 'Liters to US gallons' },
      'gal_to_l': { label: 'gal -> L', factor: '3.78541', description: 'US gallons to liters' },
      'm3_to_in3': { label: 'm3 -> in3', factor: '61023.7', description: 'Cubic meters to cubic inches' },
      'in3_to_m3': { label: 'in3 -> m3', factor: '1.6387e-5', description: 'Cubic inches to cubic meters' },
    }
  },
  energy: {
    label: 'Energy',
    conversions: {
      'j_to_btu': { label: 'J -> BTU', factor: '0.000947817', description: 'Joules to BTU' },
      'btu_to_j': { label: 'BTU -> J', factor: '1055.06', description: 'BTU to Joules' },
      'j_to_ftlbf': { label: 'J -> ft-lbf', factor: '0.737562', description: 'Joules to foot-pounds' },
      'ftlbf_to_j': { label: 'ft-lbf -> J', factor: '1.35582', description: 'Foot-pounds to Joules' },
    }
  },
  power: {
    label: 'Power',
    conversions: {
      'w_to_hp': { label: 'W -> hp', factor: '0.00134102', description: 'Watts to horsepower' },
      'hp_to_w': { label: 'hp -> W', factor: '745.7', description: 'Horsepower to Watts' },
      'w_to_btuh': { label: 'W -> BTU/h', factor: '3.41214', description: 'Watts to BTU/hour' },
      'btuh_to_w': { label: 'BTU/h -> W', factor: '0.293071', description: 'BTU/hour to Watts' },
    }
  },
  torque: {
    label: 'Torque',
    conversions: {
      'nm_to_lbft': { label: 'N-m -> lb-ft', factor: '0.737562', description: 'Newton-meters to pound-feet' },
      'lbft_to_nm': { label: 'lb-ft -> N-m', factor: '1.35582', description: 'Pound-feet to Newton-meters' },
      'nm_to_lbin': { label: 'N-m -> lb-in', factor: '8.85075', description: 'Newton-meters to pound-inches' },
      'lbin_to_nm': { label: 'lb-in -> N-m', factor: '0.112985', description: 'Pound-inches to Newton-meters' },
    }
  },
  density: {
    label: 'Density',
    conversions: {
      'kgm3_to_lbft3': { label: 'kg/m3 -> lb/ft3', factor: '0.062428', description: 'kg/m^3 to lb/ft^3' },
      'lbft3_to_kgm3': { label: 'lb/ft3 -> kg/m3', factor: '16.0185', description: 'lb/ft^3 to kg/m^3' },
      'kgm3_to_slugft3': { label: 'kg/m3 -> slug/ft3', factor: '0.00194032', description: 'kg/m^3 to slug/ft^3' },
      'slugft3_to_kgm3': { label: 'slug/ft3 -> kg/m3', factor: '515.379', description: 'slug/ft^3 to kg/m^3' },
    }
  },
  flow_rate: {
    label: 'Flow Rate',
    conversions: {
      'm3s_to_cfm': { label: 'm3/s -> CFM', factor: '2118.88', description: 'Cubic meters/sec to CFM' },
      'cfm_to_m3s': { label: 'CFM -> m3/s', factor: '0.000471947', description: 'CFM to cubic meters/sec' },
      'lpm_to_gpm': { label: 'L/min -> GPM', factor: '0.264172', description: 'Liters/min to gallons/min' },
      'gpm_to_lpm': { label: 'GPM -> L/min', factor: '3.78541', description: 'Gallons/min to liters/min' },
    }
  },
} as const

export type UnitsCategory = keyof typeof UNITS_CONVERSION_CATALOG
export type UnitsConversionType = string // Dynamic based on category

/**
 * Get all conversion types as a flat list for validation
 */
export function getAllConversionTypes(): string[] {
  const types: string[] = []
  for (const category of Object.values(UNITS_CONVERSION_CATALOG)) {
    types.push(...Object.keys(category.conversions))
  }
  return types
}

/**
 * Get conversion info by type
 */
export function getConversionInfo(conversionType: string): {
  label: string
  factor?: string
  expression?: string
  description: string
  category: string
} | null {
  for (const [catKey, category] of Object.entries(UNITS_CONVERSION_CATALOG)) {
    const conversions = category.conversions as Record<string, { label: string; factor?: string; expression?: string; description: string }>
    if (conversionType in conversions) {
      return { ...conversions[conversionType], category: catKey }
    }
  }
  return null
}

export class UnitsConversionBlockModule implements IBlockModule {

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const conversionType: string = block.parameters?.conversionType || 'deg_to_rad'
    const info = getConversionInfo(conversionType)
    const inExpr = inputs[0] || '0.0'
    const inType = inputTypes?.[0] || 'double'
    const typeInfo = BlockModuleUtils.parseType(inType)

    if (!info) {
      // Identity / unknown unit pair — still preserve vector/matrix shape
      let code = `    // Units Conversion: ${block.name} (passthrough ${conversionType})\n`
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        for (let i = 0; i < typeInfo.rows; i++) {
          for (let j = 0; j < typeInfo.cols; j++) {
            code += `    ${outputName}[${i}][${j}] = ${inExpr}[${i}][${j}];\n`
          }
        }
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        for (let i = 0; i < typeInfo.arraySize; i++) {
          code += `    ${outputName}[${i}] = ${inExpr}[${i}];\n`
        }
      } else {
        code += `    ${outputName} = ${inExpr};\n`
      }
      return code
    }

    let code = `    // Units Conversion: ${block.name} (${info.label})\n`

    const applyScalar = (xExpr: string): string => {
      if (info.expression) {
        return info.expression.replace(/\(x\)/g, `(${xExpr})`)
      }
      if (info.factor) {
        return `${xExpr} * (${info.factor})`
      }
      return xExpr
    }

    // Preserve vector/matrix shape with element-wise conversion
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          code += `    ${outputName}[${i}][${j}] = ${applyScalar(`${inExpr}[${i}][${j}]`)};\n`
        }
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      for (let i = 0; i < typeInfo.arraySize; i++) {
        code += `    ${outputName}[${i}] = ${applyScalar(`${inExpr}[${i}]`)};\n`
      }
    } else {
      code += `    ${outputName} = ${applyScalar(inExpr)};\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Units conversion output type matches input type (always double-based, preserving shape)
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    const conversionType: string = block.parameters?.conversionType || 'deg_to_rad'
    const info = getConversionInfo(conversionType)
    if (info) {
      // Extract "from" unit from label (e.g., "deg -> rad" -> "deg")
      const fromUnit = info.label.split('->')[0].trim()
      return [fromUnit]
    }
    return ['in']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    const conversionType: string = block.parameters?.conversionType || 'deg_to_rad'
    const info = getConversionInfo(conversionType)
    if (info) {
      // Extract "to" unit from label (e.g., "deg -> rad" -> "rad")
      const parts = info.label.split('->')
      const toUnit = parts[1]?.trim() || 'out'
      return [toUnit]
    }
    return ['out']
  }
}
