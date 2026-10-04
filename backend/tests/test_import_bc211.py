"""scripts/import_bc211.py: flags, DV skipping, matching and joining wrapped rows (no PDFs needed)."""
import sys
from collections import Counter
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import import_bc211 as bc  # noqa: E402

HEADER = ["City", "Shelter", "Last Update", "Beds", "Gender", "Age Range", "Note", "Intake Info", "Accessibility"]


def flags(**fields):
    return bc.infer_flags({"name": "Some Place", **fields})


def test_flags_only_when_text_clearly_says_so():
    assert flags(gender="Women")["women_only"]
    assert not flags(gender="Men and women")["women_only"]
    assert not flags(gender="All genders")["women_only"]

    women_kids = flags(gender="Women and children")
    assert women_kids["women_only"] and women_kids["families"]

    assert flags(age="16 - 24")["youth"]
    assert flags(age="Under 19")["youth"]
    assert not flags(age="19+")["youth"]
    assert not flags(age="19 - 64")["youth"]

    assert flags(note="Pets welcome")["pets_ok"]
    assert flags(note="Dogs allowed")["pets_ok"]
    assert not flags(note="No pets")["pets_ok"]
    assert not flags(note="Pets not allowed")["pets_ok"]
    assert not flags(note="Service animals only")["pets_ok"]

    assert flags(note="Couples welcome")["couples"]
    assert not flags(note="No couples")["couples"]

    assert flags(accessibility="Yes")["accessible"]
    assert flags(accessibility="Wheelchair accessible")["accessible"]
    assert not flags(accessibility="Partially accessible")["accessible"]
    assert not flags(accessibility="Not accessible")["accessible"]
    assert not flags(accessibility="No")["accessible"]

    assert not any(flags().values())


@pytest.mark.parametrize("rec", [
    {"name": "Hope Transition House"},
    {"name": "Riverside Safe Home"},
    {"name": "Harbour House", "note": "For women fleeing violence"},
    {"name": "Somewhere", "intake": "Call the domestic violence line"},
])
def test_dv_rows_are_recognised(rec):
    assert bc.is_dv(rec)


def test_substance_abuse_is_not_a_dv_signal():
    assert not bc.is_dv({"name": "Belkin House", "note": "Substance abuse supports on site"})


def test_name_matching_ignores_filler_words_and_suffixes():
    assert bc.name_keys("First United Church") & bc.name_keys("First United Church Shelter")
    assert bc.name_keys("The Sisterhood") & bc.name_keys("Sisterhood")
    assert bc.name_keys("SPUDS") & bc.name_keys("SPUDS (Previously Commercial-Hastings Shelter)")
    assert bc.name_keys("Belkin House") & bc.name_keys("Belkin House - Women And Children's Shelter")
    assert not bc.name_keys("Covenant House Vancouver") & bc.name_keys("Directions Youth Shelter")


def test_match_requires_the_same_city_when_both_are_known():
    existing = [{"id": "shelter-12", "name": "Gateway Shelter", "address": "10667 135A Street, Surrey, BC"}]
    assert bc.find_match({"name": "Gateway Shelter", "city": "Surrey"}, existing, set())["id"] == "shelter-12"
    assert bc.find_match({"name": "Gateway Shelter", "city": "Kamloops"}, existing, set()) is None


def test_city_from_address():
    assert bc.city_from_address("467 Alexander Street, Vancouver, BC") == "Vancouver"
    assert bc.city_from_address("1 Main St, North Vancouver, BC V7M 1A1, Canada") == "North Vancouver"
    assert bc.city_from_address("Smithers, BC") == "Smithers"
    assert bc.city_from_address("Surrey Central (demo location)") == ""


def test_bed_column_is_capacity_only_when_it_looks_like_totals():
    assert bc.beds_are_totals("Total Beds", [3, 0])[0]
    assert not bc.beds_are_totals("Beds Available", [40, 50])[0]
    assert bc.beds_are_totals("Beds", [40, 25, 60, 12])[0]
    assert not bc.beds_are_totals("Beds", [0, 1, 0, 2, 3])[0]  # looks like tonight's availability
    assert bc.bed_number("3/40") == 40


def parse(monkeypatch, pages):
    """Run parse_pdf over fake pages, each a list of tables (lists of rows)."""
    fake = SimpleNamespace(pages=pages)

    @contextmanager
    def fake_open(_path):
        yield fake

    monkeypatch.setitem(sys.modules, "pdfplumber", SimpleNamespace(open=fake_open))
    monkeypatch.setattr(bc, "page_tables", lambda page: page)
    stats = {"rows_found": 0, "skipped": [], "skip_reasons": Counter()}
    records, _ = bc.parse_pdf(Path("list.pdf"), stats)
    return records, stats


def test_wrapped_rows_join_within_and_across_pages(monkeypatch):
    blank = [""] * 9
    page1 = [[HEADER,
              ["Vancouver", "First United", "2026-09-30", "240", "All", "19+", "Mats and", "Walk in", "Yes"],
              ["", "Church", "", "", "", "", "beds", "", ""],
              ["Surrey", "Gateway Shelter", "2026-09-30", "40", "Men", "19+", "Long note that", "Walk in", "No"]]]
    page2 = [[HEADER,  # repeated header, then the rest of the row cut by the page break
              ["", "", "", "", "", "", "continues here", "", ""],
              blank,
              ["", "", "", "", "", "", "Note above its row", "", ""],  # centred cell, after a gap
              ["", "Second Surrey Place", "2026-09-30", "10", "Women", "19+", "", "Call", "Yes"]]]
    records, stats = parse(monkeypatch, [page1, page2])
    assert [(r["name"], r["city"]) for r in records] == [
        ("First United Church", "Vancouver"), ("Gateway Shelter", "Surrey"), ("Second Surrey Place", "Surrey")]
    assert records[0]["note"] == "Mats and beds"
    assert records[1]["note"] == "Long note that continues here"
    assert records[2]["note"] == "Note above its row"
    assert stats["skip_reasons"]["repeated header"] == 1


def test_city_heading_rows_set_the_city(monkeypatch):
    page = [[HEADER, ["Kamloops"] + [""] * 8, ["", "River Shelter", "2026-09-30", "20", "Men", "19+", "", "", ""]]]
    records, stats = parse(monkeypatch, [page])
    assert records[0]["city"] == "Kamloops"
    assert stats["skip_reasons"]["city heading"] == 1
