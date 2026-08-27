#!/usr/bin/env python3
"""
AS-205 ground track: TM-X-62831 vs current stack sim on a Mercator map
(western Atlantic zoom).

Pure matplotlib Mercator (no cartopy required).

Usage:
  python3 scripts/plot_as205_groundtrack.py
  python3 scripts/plot_as205_groundtrack.py --sim /path/to/lla.csv --out groundtrack.png
"""

from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

# Defaults relative to repo / known sibling viper tree
REPO = Path(__file__).resolve().parents[1]
DEFAULT_TM = Path(
    "/home/riley/src/viper/lib_SaturnIBObliq/model/as205-reference/tm_x_62831_geodetic.csv"
)
DEFAULT_SIM = Path("/tmp/lla_probe.csv")
DEFAULT_OUT = REPO / "examples" / "saturn-ib" / "as205_groundtrack_mercator.png"

# Western Atlantic window (deg)
LON_MIN, LON_MAX = -82.0, -58.0
LAT_MIN, LAT_MAX = 26.0, 34.0


def mercator_y(lat_deg: float) -> float:
    """Web-Mercator-style Y (radians of isometric latitude)."""
    lat = max(min(lat_deg, 89.5), -89.5)
    phi = math.radians(lat)
    return math.log(math.tan(math.pi / 4.0 + phi / 2.0))


def wrap_lon(lon: float) -> float:
    while lon > 180.0:
        lon -= 360.0
    while lon <= -180.0:
        lon += 360.0
    return lon


def load_geodetic(path: Path) -> tuple[list[float], list[float], list[float]]:
    """Return t_flight, lon_deg, lat_deg (skip comments / blanks)."""
    ts, lons, lats = [], [], []
    with path.open() as f:
        rows = [ln for ln in f if ln.strip() and not ln.lstrip().startswith("#")]
    reader = csv.DictReader(rows)
    for row in reader:
        try:
            t = float(row["t_flight"] if "t_flight" in row else row["t_flight_sec"])
            lon = wrap_lon(float(row["lon_deg"]))
            lat = float(row["lat_deg"])
        except (KeyError, ValueError):
            continue
        if not (math.isfinite(t) and math.isfinite(lon) and math.isfinite(lat)):
            continue
        if lat < 1.0:  # unset / pre-seed LLA
            continue
        ts.append(t)
        lons.append(lon)
        lats.append(lat)
    return ts, lons, lats


def draw_coast_schematic(ax) -> None:
    """Very light Florida / Cuba outline (schematic, not GSHHG)."""
    # Florida peninsula (coarse polyline, lon/lat)
    fl = [
        (-87.5, 30.3),
        (-85.0, 29.7),
        (-84.0, 30.0),
        (-82.7, 29.0),
        (-82.0, 26.5),
        (-80.5, 25.2),
        (-80.1, 25.5),
        (-80.2, 27.0),
        (-80.5, 28.0),
        (-81.0, 29.5),
        (-81.3, 30.5),
        (-81.5, 30.7),
        (-87.5, 30.3),
    ]
    # Cuba north coast snippet
    cu = [(-85.0, 23.0), (-82.0, 23.2), (-79.0, 22.5), (-77.0, 21.5), (-74.0, 20.5)]
    for poly, sty in ((fl, "-"), (cu, "--")):
        xs = [p[0] for p in poly]
        ys = [mercator_y(p[1]) for p in poly]
        ax.plot(xs, ys, sty, color="#bbbbbb", lw=0.8, zorder=0)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tm", type=Path, default=DEFAULT_TM, help="TM geodetic CSV")
    ap.add_argument("--sim", type=Path, default=DEFAULT_SIM, help="Sim LLA CSV")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output PNG")
    ap.add_argument("--show", action="store_true", help="plt.show() after save")
    ap.add_argument(
        "--align-pad",
        action="store_true",
        default=True,
        help="Shift sim lon so first point matches TM pad lon (undo ~1.25° GRR hold drift)",
    )
    ap.add_argument("--no-align-pad", action="store_false", dest="align_pad")
    args = ap.parse_args()

    if not args.tm.is_file():
        raise SystemExit(f"TM geodetic CSV not found: {args.tm}")
    if not args.sim.is_file():
        raise SystemExit(
            f"Sim LLA CSV not found: {args.sim}\n"
            "Build/run: cd /tmp/verify-lambda0-119-cgen/build && "
            "make lla_probe && ./lla_probe > /tmp/lla_probe.csv"
        )

    t_tm, lon_tm, lat_tm = load_geodetic(args.tm)
    t_sim, lon_sim, lat_sim = load_geodetic(args.sim)

    # Keep powered / early coast window for fair compare
    def window(ts, lons, lats, t0=0.0, t1=650.0):
        out = [(t, lo, la) for t, lo, la in zip(ts, lons, lats) if t0 <= t <= t1]
        if not out:
            return [], [], []
        t, lo, la = zip(*out)
        return list(t), list(lo), list(la)

    t_tm, lon_tm, lat_tm = window(t_tm, lon_tm, lat_tm)
    t_sim, lon_sim, lat_sim = window(t_sim, lon_sim, lat_sim)

    align_note = ""
    if args.align_pad and lon_tm and lon_sim:
        # Sim ECI→LLA during T_L'=300 s hold drifts ~Earth-rotation while pad is
        # fixed in ECI; shift so liftoff lon matches TM LC-34.
        dlon = lon_tm[0] - lon_sim[0]
        lon_sim = [wrap_lon(lo + dlon) for lo in lon_sim]
        align_note = f" (sim lon +{dlon:+.3f}° pad-align)"

    y_tm = [mercator_y(la) for la in lat_tm]
    y_sim = [mercator_y(la) for la in lat_sim]

    fig, ax = plt.subplots(figsize=(10, 7), dpi=140)
    draw_coast_schematic(ax)

    ax.plot(
        lon_tm,
        y_tm,
        "o-",
        color="#1f77b4",
        ms=3.5,
        lw=1.6,
        label="TM-X-62831 (Tables 6/7)",
        zorder=3,
    )
    ax.plot(
        lon_sim,
        y_sim,
        "s-",
        color="#d62728",
        ms=2.5,
        lw=1.2,
        alpha=0.9,
        label=f"Sim (stack cgen λ₀=119){align_note}",
        zorder=4,
    )

    # Mark pad and GCS-ish endpoints
    if lon_tm:
        ax.scatter([lon_tm[0]], [y_tm[0]], c="#1f77b4", s=40, zorder=5, marker="^")
        ax.scatter([lon_tm[-1]], [y_tm[-1]], c="#1f77b4", s=40, zorder=5, marker="*")
    if lon_sim:
        ax.scatter([lon_sim[0]], [y_sim[0]], c="#d62728", s=30, zorder=5, marker="^")
        ax.scatter([lon_sim[-1]], [y_sim[-1]], c="#d62728", s=30, zorder=5, marker="*")

    # Time annotations every ~100 s on TM track
    for t, lo, la, y in zip(t_tm, lon_tm, lat_tm, y_tm):
        if abs(t % 100) < 1.0 or abs(t - 144.49) < 0.2 or abs(t - 614.63) < 0.2:
            ax.annotate(
                f"{t:.0f}s",
                (lo, y),
                textcoords="offset points",
                xytext=(4, 4),
                fontsize=7,
                color="#333333",
            )

    ax.set_xlim(LON_MIN, LON_MAX)
    ax.set_ylim(mercator_y(LAT_MIN), mercator_y(LAT_MAX))

    # Latitude tick labels in degrees
    lat_ticks = list(range(int(LAT_MIN), int(LAT_MAX) + 1))
    ax.set_yticks([mercator_y(la) for la in lat_ticks])
    ax.set_yticklabels([f"{la}°N" for la in lat_ticks])
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _p: f"{v:.0f}°"))

    ax.grid(True, which="both", ls=":", lw=0.6, alpha=0.7)
    ax.set_xlabel("Longitude (deg East)")
    ax.set_ylabel("Latitude (Mercator)")
    ax.set_title(
        "AS-205 geodetic ground track — Mercator (western Atlantic)\n"
        "TM-X-62831 vs current saturn_ib_stack simulation"
    )
    ax.legend(loc="upper left", framealpha=0.92)

    # Cape Canaveral marker
    ax.plot([-80.561], [mercator_y(28.522)], "k+", ms=10, mew=1.5, zorder=6)
    ax.annotate(
        "LC-34",
        (-80.561, mercator_y(28.522)),
        textcoords="offset points",
        xytext=(-28, -12),
        fontsize=8,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(args.out, bbox_inches="tight")
    print(f"Wrote {args.out}")
    if args.show:
        plt.show()
    else:
        plt.close(fig)


if __name__ == "__main__":
    main()
