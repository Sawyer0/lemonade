"""Unit tests for diaglib (LM-16).

Pure standard library: run with ``python3 -m unittest discover -s tests``
from ``packages/diaglib``.
"""

import unittest

from diaglib.dtc import is_generic_dtc, lookup_dtc
from diaglib.fuel_trims import compute_fuel_trims
from diaglib.misfire import count_misfires
from diaglib.pids import decode_pid, supported_pids
from diaglib.waveform import waveform_stats


class DtcTests(unittest.TestCase):
    def test_generic_lean_code_has_description(self):
        result = lookup_dtc("P0171")
        self.assertEqual(result.code, "P0171")
        self.assertEqual(result.system, "P")
        self.assertEqual(result.system_name, "Powertrain")
        self.assertTrue(result.generic)
        self.assertEqual(result.subsystem, "Fuel and air metering")
        self.assertEqual(result.description, "System too lean (bank 1)")

    def test_manufacturer_specific_code_has_no_description(self):
        result = lookup_dtc("P1101")
        self.assertFalse(result.generic)
        self.assertIsNone(result.description)

    def test_lowercase_and_whitespace_normalized(self):
        self.assertEqual(lookup_dtc("  p0300 ").code, "P0300")

    def test_malformed_code_raises(self):
        for bad in ("", "P1XYZ", "P017", "P01711", "X0171", "P4171"):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    lookup_dtc(bad)

    def test_p3_split_at_p34xx(self):
        self.assertFalse(is_generic_dtc("P", "3", "3"))
        self.assertTrue(is_generic_dtc("P", "3", "4"))

    def test_body_chassis_network_generic_split(self):
        self.assertTrue(is_generic_dtc("B", "0", "0"))
        self.assertTrue(is_generic_dtc("U", "3", "0"))
        self.assertFalse(is_generic_dtc("C", "1", "0"))


class PidTests(unittest.TestCase):
    def test_fuel_trim_decode(self):
        # (128 - 128) * 100 / 128 = 0; (140 - 128) * 100 / 128 = 9.375
        self.assertEqual(decode_pid(0x06, bytes([128])).value, 0.0)
        self.assertEqual(decode_pid(0x06, bytes([140])).value, 9.375)

    def test_rpm_decode(self):
        self.assertEqual(decode_pid(0x0C, bytes([0x2E, 0xE0])).value, 3000.0)

    def test_unknown_pid_raises(self):
        with self.assertRaises(ValueError):
            decode_pid(0x99, b"\x00")

    def test_short_payload_raises(self):
        with self.assertRaises(ValueError):
            decode_pid(0x0C, b"\x2E")

    def test_supported_pids_sorted(self):
        pids = supported_pids()
        self.assertEqual(pids, sorted(pids))
        self.assertIn(0x06, pids)
        self.assertIn(0x0C, pids)


class FuelTrimTests(unittest.TestCase):
    def test_lean_watch_from_mixed_int_and_hex_pids(self):
        report = compute_fuel_trims(
            [
                {"pid": 6, "value": 12.0},
                {"pid": "0x07", "value": 8.0},
                {"pid": 0x08, "value": 1.0},
                {"pid": 0x09, "value": 0.5},
            ]
        )
        self.assertEqual(report.bank1.total_mean, 20.0)
        self.assertEqual(report.bank2.total_mean, 1.5)
        self.assertEqual(report.verdict, "lean_watch")
        self.assertEqual(report.worst_total_percent, 20.0)

    def test_rich_fault_when_total_past_threshold(self):
        report = compute_fuel_trims([{"pid": 0x06, "value": -20.0}, {"pid": 0x07, "value": -10.0}])
        self.assertEqual(report.verdict, "rich_fault")

    def test_empty_log_is_normal(self):
        report = compute_fuel_trims([])
        self.assertEqual(report.verdict, "normal")
        self.assertIsNone(report.worst_total_percent)
        self.assertEqual(report.bank1.sample_count, 0)

    def test_unrelated_pids_ignored(self):
        report = compute_fuel_trims([{"pid": 0x0C, "value": 3000.0}])
        self.assertEqual(report.bank1.sample_count, 0)

    def test_bad_pid_raises(self):
        with self.assertRaises(ValueError):
            compute_fuel_trims([{"pid": "ZZ", "value": 1.0}])


class MisfireTests(unittest.TestCase):
    def test_worst_cylinder_is_explicit(self):
        report = count_misfires(
            [
                {"cylinder": 3, "timestamp": 0.0},
                {"cylinder": 3, "timestamp": 30.0},
                {"cylinder": 1, "timestamp": 60.0},
            ]
        )
        self.assertEqual(report.counts_by_cylinder, {3: 2, 1: 1})
        self.assertEqual(report.total, 3)
        self.assertEqual(report.worst_cylinder, 3)
        self.assertEqual(report.worst_count, 2)
        self.assertEqual(report.rate_per_minute, 3.0)

    def test_empty_events_have_no_rate(self):
        report = count_misfires([])
        self.assertEqual(report.total, 0)
        self.assertIsNone(report.worst_cylinder)
        self.assertIsNone(report.rate_per_minute)

    def test_zero_based_cylinder_raises(self):
        with self.assertRaises(ValueError):
            count_misfires([{"cylinder": 0, "timestamp": 0.0}])


class WaveformTests(unittest.TestCase):
    def test_stats(self):
        stats = waveform_stats([1000.0, 1100.0, 1050.0])
        self.assertEqual(stats.count, 3)
        self.assertEqual(stats.mean, 1050.0)
        self.assertEqual(stats.minimum, 1000.0)
        self.assertEqual(stats.maximum, 1100.0)
        self.assertEqual(stats.stdev, 50.0)
        self.assertEqual(stats.span, 100.0)

    def test_single_value_has_zero_stdev(self):
        stats = waveform_stats([42.0])
        self.assertEqual(stats.stdev, 0.0)
        self.assertEqual(stats.span, 0.0)

    def test_empty_series_raises(self):
        with self.assertRaises(ValueError):
            waveform_stats([])


if __name__ == "__main__":
    unittest.main()
