#!/usr/bin/env python3
"""Build the Pure Alpha dashboard data from the frozen research run.

Source (Pure Alpha repo), selected with --run:
    pit (default)  research/results/phase3_pit/R3_strategy.json + R3_trades.json
                   the frozen pure_alpha_v1.0 strategy re-run with point-in-time
                   lots, F&O listing dates and universe (research/phase3_pit.py);
                   research/results/phase3_pit/summary.json supplies the bridge
                   from the frozen result
    frozen         research/results/phase3/ems_strategy.json + ems_trades.json
                   the original frozen run (today's lots and 207-name universe)

Every figure the dashboard shows is either copied from the run summary or
recomputed here from its trades. The script refuses to write anything if the
recomputed headline numbers do not reconcile with the run's own summary.

Usage:
    python3 tools/build_pure_alpha_data.py /path/to/pure-alpha [/path/to/nifty50_tri_daily.csv] [--run pit|frozen]

Outputs:
    assets/js/pure-alpha-data.js              analytics (window.PURE_ALPHA)
"""
from __future__ import annotations

import bisect
import csv
import json
import math
import os
import statistics as st
import sys
from collections import defaultdict
from datetime import date, datetime

TRADING_DAYS = 252  # same annualisation as the research engine
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def die(msg: str) -> None:
    sys.exit("RECONCILIATION FAILED: " + msg)


def close(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= tol


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    run = "frozen" if "--run=frozen" in sys.argv or ("--run" in sys.argv and "frozen" in sys.argv) else "pit"
    args = [a for a in args if a not in ("pit", "frozen")]
    repo = args[0] if args else os.path.expanduser("~/Final/pure-alpha")
    tri_path = args[1] if len(args) > 1 else None
    if run == "pit":
        res = os.path.join(repo, "research", "results", "phase3_pit")
        summ = json.load(open(os.path.join(res, "R3_strategy.json")))
        trades = json.load(open(os.path.join(res, "R3_trades.json")))
        pit_summary = json.load(open(os.path.join(res, "summary.json")))
    else:
        res = os.path.join(repo, "research", "results", "phase3")
        summ = json.load(open(os.path.join(res, "ems_strategy.json")))
        trades = json.load(open(os.path.join(res, "ems_trades.json")))
        pit_summary = None
    P = summ["portfolio"]

    # ---------------------------------------------------------------- daily P&L
    # Research engine definition (phase2_final_strategy._daily): net P&L keyed on exit date.
    daily: dict[str, float] = defaultdict(float)
    for t in trades:
        daily[t["exit_ts"][:10]] += t["net"]
    days = sorted(daily)
    r = [daily[d] for d in days]
    mu = sum(r) / len(r)
    sd = (sum((x - mu) ** 2 for x in r) / (len(r) - 1)) ** 0.5
    dn = [x for x in r if x < 0]
    dsd = (sum(x * x for x in dn) / len(dn)) ** 0.5
    sharpe = mu / sd * TRADING_DAYS ** 0.5
    sortino = mu / dsd * TRADING_DAYS ** 0.5

    cum, peak, dd = [], [], []
    run = pk = 0.0
    for x in r:
        run += x
        pk = max(pk, run)
        cum.append(run)
        peak.append(pk)
        dd.append(run - pk)
    max_dd = min(dd)
    net = sum(t["net"] for t in trades)

    # ---------------------------------------------------------- reconciliation
    if len(trades) != P["trades"]:
        die(f"positions {len(trades)} vs {P['trades']}")
    if not close(net, P["net"], 1.0):
        die(f"net {net} vs {P['net']}")
    if not close(sharpe, P["sharpe"], 1e-6):
        die(f"sharpe {sharpe} vs {P['sharpe']}")
    if not close(sortino, P["sortino"], 1e-6):
        die(f"sortino {sortino} vs {P['sortino']}")
    if not close(max_dd, P["max_dd"], 1.0):
        die(f"max dd {max_dd} vs {P['max_dd']}")
    if len(days) != P["trading_days"]:
        die(f"P&L days {len(days)} vs {P['trading_days']}")

    cap = P["initial_capital"]  # peak margin reserved; the research engine's capital base

    # ------------------------------------------------------- drawdown episodes
    episodes = []
    i = 0
    n = len(days)
    while i < n:
        if dd[i] < 0:
            start = i - 1 if i > 0 else 0  # last day at the running peak
            j = i
            trough = i
            while j < n and dd[j] < 0:
                if dd[j] < dd[trough]:
                    trough = j
                j += 1
            rec = j if j < n else None
            episodes.append({
                "peak": days[start], "trough": days[trough],
                "recovered": days[rec] if rec is not None else None,
                "depth": round(dd[trough], 2),
                "depth_pct_cap": round(dd[trough] / cap * 100, 2),
                "days_to_trough": trough - start,
                "days_to_recover": (rec - trough) if rec is not None else None,
                "pnl_days": ((rec if rec is not None else n - 1) - start),
                "cal_days": ((datetime.fromisoformat(days[rec]) if rec is not None else datetime.fromisoformat(days[-1]))
                             - datetime.fromisoformat(days[start])).days,
            })
            i = j
        else:
            i += 1
    worst_eps = sorted(episodes, key=lambda e: e["depth"])[:5]
    longest = max(episodes, key=lambda e: e["cal_days"])
    if not close(worst_eps[0]["depth"], P["max_dd"], 1.0):
        die("worst drawdown episode does not equal max_dd")

    # ------------------------------------------------------------- by year
    # Keyed on realisation (exit) year, as the published year table is.
    yr = defaultdict(lambda: {"net": 0.0, "n": 0, "w": 0})
    for t in trades:
        y = t["exit_ts"][:4]
        yr[y]["net"] += t["net"]
        yr[y]["n"] += 1
        yr[y]["w"] += t["net"] > 0
    years = []
    for y in sorted(yr):
        idx = [k for k, d in enumerate(days) if d[:4] == y]
        rr = [r[k] for k in idx]
        run = pk = m = 0.0
        for x in rr:
            run += x
            pk = max(pk, run)
            m = min(m, run - pk)
        mu_y = sum(rr) / len(rr)
        # Population SD, as the published Pure Alpha year table computes it (the headline 2.02 uses the sample SD).
        sd_y = (sum((x - mu_y) ** 2 for x in rr) / len(rr)) ** 0.5 if len(rr) > 1 else 0
        years.append({
            "year": y, "net": round(yr[y]["net"], 2), "trades": yr[y]["n"],
            "win_rate": round(yr[y]["w"] / yr[y]["n"] * 100, 2),
            "max_dd": round(m, 2),
            "sharpe": round(mu_y / sd_y * TRADING_DAYS ** 0.5, 2) if sd_y else None,
            "roc": round(yr[y]["net"] / cap * 100, 2),
            "first": days[idx[0]], "last": days[idx[-1]],
        })
    if not close(sum(y["net"] for y in years), net, 1.0):
        die("year table does not sum to net")

    # ------------------------------------------------------------- by month
    mo = defaultdict(float)
    mo_n = defaultdict(int)
    for t in trades:
        mo[t["exit_ts"][:7]] += t["net"]
        mo_n[t["exit_ts"][:7]] += 1
    months = [{"m": k, "net": round(v, 2), "roc": round(v / cap * 100, 3), "trades": mo_n[k]} for k, v in sorted(mo.items())]
    if not close(sum(m["net"] for m in months), net, 1.0):
        die("month table does not sum to net")

    # ------------------------------------------------------ per underlying
    by = defaultdict(lambda: {"net": 0.0, "n": 0, "w": 0})
    for t in trades:
        b = by[t["symbol"]]
        b["net"] += t["net"]
        b["n"] += 1
        b["w"] += t["net"] > 0
    under = sorted(({"s": s, "net": round(v["net"], 2), "n": v["n"], "wr": round(v["w"] / v["n"] * 100, 1),
                     "avg": round(v["net"] / v["n"], 2)} for s, v in by.items()), key=lambda x: -x["net"])
    n_traded = summ["universe"].get("traded", summ["universe"]["instruments"])
    if len(under) != n_traded:
        die(f"{len(under)} traded underlyings vs {n_traded} in the run")
    profitable = sum(1 for u in under if u["net"] > 0)
    top10_share = sum(u["net"] for u in under[:10]) / net * 100

    # ------------------------------------------------------ distribution
    pnl = sorted(t["net"] for t in trades)
    def pct(p: float) -> float:
        k = (len(pnl) - 1) * p
        f, c = math.floor(k), math.ceil(k)
        return pnl[f] + (pnl[c] - pnl[f]) * (k - f)
    lo_edge, hi_edge, width = -150_000, 400_000, 10_000
    edges = list(range(lo_edge, hi_edge + width, width))
    counts = [0] * (len(edges) - 1)
    under_lo = over_hi = 0
    for x in pnl:
        if x < lo_edge:
            under_lo += 1
        elif x >= hi_edge:
            over_hi += 1
        else:
            counts[int((x - lo_edge) // width)] += 1
    wins = [x for x in pnl if x > 0]
    losses = [x for x in pnl if x <= 0]
    best = max(trades, key=lambda t: t["net"])
    worst = min(trades, key=lambda t: t["net"])
    if not (close(best["net"], P["best"], 0.01) and close(worst["net"], P["worst"], 0.01)):
        die("best/worst trade mismatch")
    dist = {
        "edges": edges, "counts": counts, "below": under_lo, "above": over_hi,
        "mean": round(mu_t := net / len(pnl), 2), "median": round(st.median(pnl), 2),
        "p01": round(pct(0.01), 2), "p05": round(pct(0.05), 2), "p95": round(pct(0.95), 2), "p99": round(pct(0.99), 2),
        "avg_win": round(sum(wins) / len(wins), 2), "avg_loss": round(sum(losses) / len(losses), 2),
        "best": {"s": best["symbol"], "net": best["net"], "entry": best["entry1_ts"], "exit": best["exit_ts"]},
        "worst": {"s": worst["symbol"], "net": worst["net"], "entry": worst["entry1_ts"], "exit": worst["exit_ts"]},
        "top10_share_of_gross_profit": round(sum(pnl[-10:]) / sum(wins) * 100, 2),
        "worst50_sum": round(sum(pnl[:50]), 2),
    }

    # ------------------------------------------------------ holding / timing
    def hold_days(t) -> int:
        a = date.fromisoformat(t["entry1_ts"][:10])
        b = date.fromisoformat(t["exit_ts"][:10])
        return (b - a).days
    holds = sorted(hold_days(t) for t in trades)
    hb = [("Same session", 0, 0), ("1 day", 1, 1), ("2–5 days", 2, 5), ("6–10 days", 6, 10),
          ("11–20 days", 11, 20), ("21–40 days", 21, 40), ("Over 40 days", 41, 10 ** 6)]
    hold_buckets = []
    for label, a, b in hb:
        sel = [t for t in trades if a <= hold_days(t) <= b]
        hold_buckets.append({"label": label, "n": len(sel), "net": round(sum(t["net"] for t in sel), 2),
                             "wr": round(sum(t["net"] > 0 for t in sel) / len(sel) * 100, 1) if sel else None})
    by_hour = defaultdict(lambda: {"n": 0, "net": 0.0, "w": 0})
    by_dow = defaultdict(lambda: {"n": 0, "net": 0.0, "w": 0})
    for t in trades:
        h = datetime.fromisoformat(t["entry1_ts"])
        # Regular session bars run 09:15-15:15; later stamps are NSE special sessions
        # (Diwali Muhurat evenings, the 24 Feb 2021 extended session), grouped together.
        slot = f"{h.hour:02d}:{h.minute:02d}" if (h.hour, h.minute) <= (15, 15) else "Special"
        for bucket, key in ((by_hour, slot), (by_dow, h.weekday())):
            bucket[key]["n"] += 1
            bucket[key]["net"] += t["net"]
            bucket[key]["w"] += t["net"] > 0
    hours = [{"k": k, "n": v["n"], "net": round(v["net"], 2), "wr": round(v["w"] / v["n"] * 100, 1)} for k, v in sorted(by_hour.items())]
    dnames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dows = [{"k": dnames[k], "n": v["n"], "net": round(v["net"], 2), "wr": round(v["w"] / v["n"] * 100, 1)} for k, v in sorted(by_dow.items())]

    # ------------------------------------------------------ exits / overnight
    reasons = defaultdict(lambda: {"n": 0, "net": 0.0})
    for t in trades:
        reasons[t["exit_reason"]]["n"] += 1
        reasons[t["exit_reason"]]["net"] += t["net"]
    exit_reasons = sorted(({"k": k, "n": v["n"], "net": round(v["net"], 2)} for k, v in reasons.items()), key=lambda x: -x["n"])
    # exit_on_session_open: the exit fired on the opening bar after an overnight hold (a gap exit).
    on = [t for t in trades if t["exit_on_session_open"]]
    if len(on) != summ["risk"]["book"]["overnight"]:
        die(f"session-open exits {len(on)} vs {summ['risk']['book']['overnight']}")
    same = [t for t in trades if hold_days(t) == 0]
    carried = [t for t in trades if hold_days(t) > 0]

    # ------------------------------------------------------ concurrency
    ev = []
    for t in trades:
        ev.append((t["entry1_ts"], 1))
        ev.append((t["exit_ts"], -1))
    ev.sort(key=lambda e: (e[0], e[1]))  # exits before entries at the same stamp
    cur = pmax = 0
    pmax_at = ""
    for ts, k in ev:
        cur += k
        if cur > pmax:
            pmax, pmax_at = cur, ts

    # ------------------------------------------------------ peak margin before a date
    def peak_margin_until(cut: str) -> float:
        evm = []
        for t in trades:
            for ts, m in t["margin_in"]:
                evm.append((ts, 1, m))
            for ts, m in t["margin_out"]:
                evm.append((ts, 0, m))
        evm.sort(key=lambda e: (e[0], e[1]))
        c = best = 0.0
        for ts, kind, m in evm:
            if ts > cut:
                break
            c += m if kind else -m
            best = max(best, c)
        return best
    pm_all = peak_margin_until("9999")
    if not close(pm_all, cap, 1.0):
        die(f"peak margin sweep {pm_all} vs {cap}")
    pm_before_dd = peak_margin_until(worst_eps[0]["trough"] + " 23:59:59")

    # ------------------------------------------------------ daily-loss analysis
    thr_2pct = -0.02 * cap
    thr_live = -500_000.0  # Pure Alpha live guardrail daily_loss_limit_inr (config.py), not part of the backtest
    worst_day = min(zip(r, days))
    daily_loss = {
        "worst_day": {"d": worst_day[1], "net": round(worst_day[0], 2)},
        "best_day": {"d": max(zip(r, days))[1], "net": round(max(r), 2)},
        "days_below_2pct": sum(1 for x in r if x <= thr_2pct),
        "days_below_5l": sum(1 for x in r if x <= thr_live),
        "threshold_2pct": round(thr_2pct, 2),
        "loss_days": sum(1 for x in r if x < 0),
        "pnl_days": len(r),
    }

    # ------------------------------------------------------ benchmark (optional)
    bench = None
    if tri_path and os.path.exists(tri_path):
        tri = [(row["trade_date"], float(row["ntr_close"])) for row in csv.DictReader(open(tri_path))]
        tri_d = [d for d, _ in tri]
        start = P["first_entry"]
        k0 = bisect.bisect_right(tri_d, start) - 1  # close on/before the first entry day
        base = tri[k0][1]
        series = []
        for d in days:
            k = bisect.bisect_right(tri_d, d) - 1
            if tri_d[k] < d and d > tri_d[-1]:
                series.append(None)  # past the end of the benchmark file
            else:
                series.append(round(cap * (tri[k][1] / base - 1), 2))
        yr_ret = {}
        for y in sorted({d[:4] for d in days}):
            ys = [(d, v) for d, v in tri if d[:4] == y and d >= start]
            prev = [(d, v) for d, v in tri if d < max(f"{y}-01-01", start)]
            if ys and prev:
                yr_ret[y] = {"ret": round((ys[-1][1] / prev[-1][1] - 1) * 100, 2), "to": ys[-1][0]}
        run = pk = m = 0.0
        vals = [cap * (v / base) for d, v in tri[k0:]]
        pk = vals[0]
        for v in vals:
            pk = max(pk, v)
            m = min(m, v / pk - 1)
        bench = {"name": "NIFTY 50 Total Return Index", "source": "niftyindices.com (gross TRI)",
                 "base_date": tri[k0][0], "end": tri_d[-1], "pnl": series, "years": yr_ret,
                 "max_dd_pct": round(m * 100, 2)}

    # ------------------------------------------------------ assemble
    F = summ["final"]
    out = {
        "meta": {
            "source": "Pure Alpha repo · research/results/phase3/ems_strategy.json + ems_trades.json",
            "producing_stage": "research/phase3_ems_tracking.py",
            "version": "pure_alpha_v1.0 (frozen 2026-08-12)",
            "generated": date.today().isoformat(),
            "reconciled": {"positions": len(trades), "net": round(net, 2), "sharpe": round(sharpe, 6),
                           "sortino": round(sortino, 6), "max_dd": round(max_dd, 2), "pnl_days": len(days)},
        },
        "headline": {
            "net": P["net"], "gross": P["gross_pnl"], "costs": P["costs"], "slippage": P["slippage"],
            "sharpe": P["sharpe"], "sortino": P["sortino"], "max_dd": P["max_dd"],
            "peak_margin": cap, "peak_margin_at": P["peak_margin_at"], "return_pct": P["return_pct"],
            "cagr": P["cagr"], "years": P["years"], "dd_pct_capital": P["dd_pct_capital"],
            "net_over_dd": P["calmar"], "positions": P["trades"], "underlyings": summ["universe"]["instruments"],
            "bars": summ["universe"]["bars"], "data_start": summ["universe"]["start"], "data_end": summ["universe"]["end"],
            "first_entry": P["first_entry"], "last_exit": P["last_exit"], "win_rate": P["win_rate"],
            "profit_factor": P["profit_factor"], "avg_win": P["avg_win"], "avg_loss": P["avg_loss"],
            "expectancy": P["expectancy"], "expectancy_R": P["expectancy_R"], "best": P["best"], "worst": P["worst"],
            "hit_target_pct": P["hit_target_pct"], "capital_utilisation": P["capital_utilisation"],
            "notional_median": P["notional_median"], "mean_leverage": summ["risk"]["book"]["mean_leverage"],
            "ann_vol_pct_cap": round(sd * TRADING_DAYS ** 0.5 / cap * 100, 2),
            "median_hold_days": st.median(holds), "mean_hold_days": round(sum(holds) / len(holds), 2),
            "max_concurrent": pmax, "max_concurrent_at": pmax_at, "peak_margin_to_max_dd_trough": round(pm_before_dd, 2),
            "open_exit_positions": len(on), "open_exit_net": round(sum(t["net"] for t in on), 2),
            "carried_positions": len(carried), "carried_net": round(sum(t["net"] for t in carried), 2),
            "same_session_positions": len(same), "same_session_net": round(sum(t["net"] for t in same), 2),
            "gap_cost_book": summ["risk"]["gap_cost_book"], "worse_than_2R": summ["risk"]["worse_than_2R"],
            "worst_R": summ["risk"]["worst_R"], "profitable_underlyings": profitable,
            "top10_underlying_share": round(top10_share, 2),
        },
        "params_public": {"timeframe": F["timeframe"], "direction": F["direction"],
                          "risk_budget": F["risk_budget"], "margin_budget": F["margin_budget"],
                          "slippage_bps": F["slippage_bps"]},
        "equity": {"d": days, "cum": [round(x, 2) for x in cum], "dd": [round(x, 2) for x in dd]},
        "drawdowns": worst_eps, "longest_drawdown": longest,
        "years": years, "months": months,
        "under_top": under[:10], "under_bottom": under[-10:][::-1],
        "dist": dist, "hold_buckets": hold_buckets, "hours": hours, "dows": dows,
        "exit_reasons": exit_reasons, "daily_loss": daily_loss,
        "split": {"a": {k: summ["split"]["a"][k] for k in ("trades", "net", "sharpe", "max_dd", "win_rate", "profit_factor", "cagr")},
                  "b": {k: summ["split"]["b"][k] for k in ("trades", "net", "sharpe", "max_dd", "win_rate", "profit_factor", "cagr")},
                  "label_a": summ["split"]["label_a"], "label_b": summ["split"]["label_b"]},
        "sweep": [{k: s[k] for k in ("trigger_pct", "net", "sharpe", "max_dd", "win_rate")} for s in summ["sweep"]],
        "caps": [{k: c[k] for k in ("cap", "trades", "net", "sharpe", "max_dd")} for c in summ["notional_caps"]],
        "validation": [{"check": v["check"], "pass": v["pass"]} for v in summ.get("validation", [])],
        "benchmark": bench,
        "run": run,
        "universe_run": summ["universe"],
    }
    if pit_summary:
        keep = ("trades", "net", "sharpe", "max_dd", "initial_capital", "cagr", "win_rate", "profit_factor")
        out["bridge"] = {k: {f: v["summary"][f] for f in keep} for k, v in pit_summary["runs"].items()}
        out["bridge_parity"] = pit_summary["runs"]["R0"].get("parity")
        out["pit_coverage"] = pit_summary["reference"]
        out["meta"]["source"] = "Pure Alpha repo · research/results/phase3_pit/R3_strategy.json + R3_trades.json (point-in-time re-run of the frozen v1.0 strategy)"
        out["meta"]["producing_stage"] = "research/phase3_pit.py (engine: research/phase3_ems_tracking.py, unchanged)"
        # per-position budgets, recomputed from the trades
        out["budgets"] = {"max_risk_rs": max(t["risk_rs"] for t in trades),
                          "max_margin": max(t["margin"] for t in trades),
                          "max_leg_diff": max(abs(t["pnl1"] + t["pnl2"] - t["net"]) for t in trades)}

    js = os.path.join(HERE, "assets", "js", "pure-alpha-data.js")
    with open(js, "w") as f:
        f.write("/* Generated by tools/build_pure_alpha_data.py. Do not edit by hand.\n"
                "   Source: " + out["meta"]["source"] + " */\n")
        f.write("window.PURE_ALPHA = " + json.dumps(out, separators=(",", ":")) + ";\n")

    print(json.dumps(out["meta"]["reconciled"]))
    print("peak concurrent", pmax, pmax_at, "| median hold", st.median(holds), "| longest dd", longest)
    print("worst eps", worst_eps[:2])
    print("years", [(y["year"], round(y["net"] / 1e5, 1), y["trades"], y["sharpe"], round(y["max_dd"] / 1e7, 3)) for y in years])
    print("daily loss", daily_loss)
    print("bench", bench and {k: bench[k] for k in ("base_date", "end", "max_dd_pct", "years")})
    print("dist", {k: dist[k] for k in ("mean", "median", "p01", "p05", "p95", "p99", "below", "above", "best", "worst")})
    print("exit reasons", exit_reasons)
    print("hold buckets", hold_buckets)
    print("under top3", under[:3], "bottom3", under[-3:], "profitable", profitable, "top10 share", round(top10_share, 1))


if __name__ == "__main__":
    main()
