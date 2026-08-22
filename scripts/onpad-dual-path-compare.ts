/**
 * Closed-form On Pad @ t vs RTW --onpad-trace dump.
 * Usage: npx tsx scripts/onpad-dual-path-compare.ts [t_sec]
 */
import * as fs from 'fs'
import { as205OnPadStateAtTime } from '../examples/saturn-ib/as205OnPad'

function hypot(xs: number[]): number {
  return Math.sqrt(xs.reduce((s, x) => s + x * x, 0))
}

function dmag(a: number[], b: number[]): number {
  return hypot(a.map((x, i) => x - b[i]!))
}

function main(): void {
  const t = Number(process.argv[2] ?? 0.01)
  const pred = as205OnPadStateAtTime(t)
  const path = '/tmp/ic-matched/rtw-onpad.json'
  const report: Record<string, unknown> = {
    t_sec: t,
    predicted: {
      theta_GMST_deg: pred.theta_GMST_deg,
      Xe_m: pred.Xe_m,
      Ve_mps: pred.Ve_mps,
      Vb_mps: pred.Vb_mps,
      lat_deg: pred.lat_deg,
      lon_deg: pred.lon_deg,
      h_m: pred.h_m,
      q_ECI: pred.q_ECI
    }
  }

  if (fs.existsSync(path)) {
    const rtw = JSON.parse(fs.readFileSync(path, 'utf8')) as {
      t_sec: number
      theta_GMST_0_deg: number
      Xe_m: number[]
      Ve_mps: number[]
      Vb_mps: number[]
      lat_deg: number
      lon_deg: number
      h_m: number
      q_ECI: number[]
    }
    report.rtw = {
      t_sec: rtw.t_sec,
      theta_GMST_0_deg: rtw.theta_GMST_0_deg,
      Xe_m: rtw.Xe_m,
      Ve_mps: rtw.Ve_mps,
      Vb_mps: rtw.Vb_mps,
      lat_deg: rtw.lat_deg,
      lon_deg: rtw.lon_deg,
      h_m: rtw.h_m
    }
    report.delta = {
      dGMST_deg: pred.theta_GMST_deg - rtw.theta_GMST_0_deg,
      dXe_m: dmag(pred.Xe_m, rtw.Xe_m),
      dVe_mps: dmag(pred.Ve_mps, rtw.Ve_mps),
      dVb_mps: dmag(pred.Vb_mps, rtw.Vb_mps),
      dlat_deg: pred.lat_deg - rtw.lat_deg,
      dlon_deg: pred.lon_deg - rtw.lon_deg,
      dh_m: pred.h_m - rtw.h_m,
      dq: Math.min(
        dmag(pred.q_ECI, rtw.q_ECI),
        hypot(pred.q_ECI.map((x, i) => x + rtw.q_ECI[i]!))
      )
    }
  } else {
    report.note = `RTW dump missing: ${path}`
  }

  fs.mkdirSync('/tmp/ic-matched', { recursive: true })
  const out = '/tmp/ic-matched/onpad-dual-path.json'
  fs.writeFileSync(out, JSON.stringify(report, null, 2))

  console.log('On Pad closed-form @ t=', t)
  console.log('  GMST', pred.theta_GMST_deg.toFixed(9))
  console.log('  |Xe|', hypot(pred.Xe_m).toFixed(6))
  console.log('  LLA', pred.lat_deg.toFixed(6), pred.lon_deg.toFixed(6), pred.h_m.toFixed(3))
  if (report.delta) {
    const d = report.delta as Record<string, number>
    console.log('vs RTW dump:')
    console.log('  |dXe|', d.dXe_m.toExponential(4))
    console.log('  |dVe|', d.dVe_mps.toExponential(4))
    console.log('  |dVb|', d.dVb_mps.toExponential(4))
    console.log('  dlat/dlon/dh', d.dlat_deg, d.dlon_deg, d.dh_m)
    console.log('  |dq|_min', d.dq.toExponential(4))
  }
  console.log('Wrote', out)
}

main()
