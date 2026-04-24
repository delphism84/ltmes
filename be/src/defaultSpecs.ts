/** 규격별 자재 사용·목표(kg). BE 배치 FSM·FE 30% 투명도와 공유 */
export type SpecMaterial = { enabled: boolean; targetKg: number | null }

export type LtmesSpec = {
  specId: string
  materials: Partial<Record<string, SpecMaterial>>
}

export const MATERIAL_CODES = ['G1', 'S2', 'S1', 'W', 'M3', 'C1', 'C2', 'Ad1', 'Ad2'] as const

export type MaterialCode = (typeof MATERIAL_CODES)[number]

export function defaultMaterials(partial?: Partial<Record<MaterialCode, SpecMaterial>>): Record<string, SpecMaterial> {
  const base: Record<string, SpecMaterial> = {}
  for (const c of MATERIAL_CODES) {
    base[c] = { enabled: true, targetKg: null }
  }
  if (partial) {
    for (const [k, v] of Object.entries(partial)) {
      if (v) base[k] = { enabled: !!v.enabled, targetKg: v.targetKg ?? null }
    }
  }
  return base
}

export const DEFAULT_LTMES_SPECS: { specs: LtmesSpec[] } = {
  specs: [
    {
      specId: '20-40-80',
      materials: defaultMaterials({
        G1: { enabled: true, targetKg: 100 },
        S2: { enabled: true, targetKg: 80 },
        S1: { enabled: true, targetKg: 60 },
        W: { enabled: true, targetKg: 20 },
        M3: { enabled: false, targetKg: null },
        C1: { enabled: false, targetKg: null },
        C2: { enabled: false, targetKg: null },
        Ad1: { enabled: false, targetKg: null },
        Ad2: { enabled: false, targetKg: null }
      })
    },
    {
      specId: '25-27-150',
      materials: defaultMaterials({
        G1: { enabled: true, targetKg: 120 },
        S2: { enabled: true, targetKg: 90 },
        S1: { enabled: true, targetKg: 70 },
        W: { enabled: true, targetKg: 25 },
        M3: { enabled: true, targetKg: 5 }
      })
    },
    {
      specId: '25-40-150',
      materials: defaultMaterials({
        G1: { enabled: true, targetKg: 110 },
        S2: { enabled: true, targetKg: 85 },
        S1: { enabled: true, targetKg: 65 },
        W: { enabled: true, targetKg: 22 },
        M3: { enabled: true, targetKg: 4 }
      })
    }
  ]
}
