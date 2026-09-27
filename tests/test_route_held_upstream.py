"""A depot fed by a route the log cannot measure, on synthetic fixtures only.

A factory used as a store tops a warehouse up from what it holds. Where the
warehouse's rounds are too few to log, its draw is what the shops sell and
the route's share cannot be measured, so the import looks like the whole
supply. While the senders hold a week of the need, the order is not judged;
with less than that, it is judged as before.
"""
import unittest

from ba_dashboard import Names, _import_notes, _supply, site_key
from test_routed_supply import DAY, DEPOT, FACTORY, FOOD, SHOP, SaveStub, contract, plan

SOLD = 500  # what the shop sells a day, and so the depot's draw
LINE = ("line", 3)  # a second factory whose line the depot can feed


def supply_for(factory_units, route=True, target=10000, depot_units=9000, active=True,
               feeds_line=False):
    """_supply() over a factory, a depot and a shop with no logged rounds: the
    depot's draw is the shop's sales, and a 1,000 Smart Delivery import is a
    fraction of the week's 3,500. The factory's route tops the depot up to
    `target`; with `feeds_line` the depot tops a factory up too (its line
    draws on it). Returns the depot's import row, its fact and the order
    findings."""
    plans = [plan(DEPOT, SHOP, 2000)] + ([plan(FACTORY, DEPOT, target)] if route else [])
    if feeds_line:
        plans.append(plan(DEPOT, LINE, 2000))
    save = SaveStub({}, plans, [contract(1000, 1000, smart=True, active=active)])

    def business(site, name, kind, status, units, rate):
        return {"key": site_key(site), "name": name, "code": "", "neighbourhood": "",
                "type": kind, "typeSlug": kind, "status": status,
                "lines": [{"slug": FOOD, "item": "Frozen Food", "units": units, "rate": rate,
                           "price": 1 if status == "retail" else 0}]}

    businesses = [
        business(FACTORY, "Food Factory", "factory", "support", factory_units, 0),
        business(DEPOT, "Depot", "warehouse", "support", depot_units, 0),
        business(SHOP, "Shop", "supermarket", "retail", 1500, SOLD),
        business(LINE, "Line Factory", "ba:businesstype_factory", "support", 0, 0),
    ]
    supply = _supply(save, Names({}), businesses, DAY, {})
    row = next(r for r in supply["imports"] if r["s"] == 1)
    orders = [n for n in _import_notes(businesses, supply, set()) if n["group"] == "order"]
    return row, supply["facts"]["1"][FOOD], orders


class HeldUpstreamTests(unittest.TestCase):
    def test_a_sender_holding_a_week_leaves_the_order_unjudged(self):
        row, fact, orders = supply_for(factory_units=20000)
        self.assertEqual(row["basis"], "sales")
        self.assertTrue(row.get("heldUpstream"))
        self.assertEqual((row["orderFit"], row["level"]), ("ok", "ok"))
        self.assertEqual(orders, [])
        # The fact every table reads agrees, and says the route brings it.
        self.assertEqual((fact["st"], fact["why"], fact["setTo"]), ("covered", "route", None))

    def test_a_sender_holding_less_than_a_week_still_judges_the_order(self):
        row, fact, orders = supply_for(factory_units=1000)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual((fact["st"], fact["why"]), ("short", "order"))
        self.assertEqual((row["orderFit"], row["level"], row["reason"]), ("short", "critical", "order"))
        self.assertEqual(len(orders), 1)

    def test_without_a_route_the_order_is_judged(self):
        row, _fact, orders = supply_for(factory_units=20000, route=False)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual(row["orderFit"], "short")
        self.assertEqual(len(orders), 1)

    def test_a_route_with_a_small_target_cannot_bring_the_week(self):
        """A round a day tops the depot up to 100: at most 700 a week, however
        much the factory holds, against the week's 3,500."""
        row, fact, orders = supply_for(factory_units=20000, target=100)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual((row["orderFit"], fact["st"], fact["why"]), ("short", "short", "order"))
        self.assertEqual(len(orders), 1)

    def test_a_shelf_that_cannot_reach_the_drop_still_reads_short(self):
        """The order is not judged, but 600 on the shelf at 500 a day does not
        reach the import four days off."""
        row, fact, _orders = supply_for(factory_units=20000, depot_units=600)
        self.assertTrue(row.get("heldUpstream"))
        self.assertEqual((row["orderFit"], row["coverFit"]), ("ok", "short"))
        self.assertEqual((row["level"], row["reason"]), ("critical", "shortfall"))
        self.assertEqual((fact["st"], fact["why"]), ("short", "shortfall"))


    def test_pausing_the_backup_beside_a_held_route_asks_nothing_back(self):
        """The board calls the import a backup; pausing it must not turn the
        line into a paused import to resume."""
        row, fact, _orders = supply_for(factory_units=20000, active=False)
        self.assertTrue(row.get("heldUpstream"))
        self.assertNotEqual(row["reason"], "paused")
        self.assertEqual((fact["st"], fact["why"]), ("covered", "route"))

    def test_a_paused_import_without_a_held_route_is_still_paused(self):
        row, fact, _orders = supply_for(factory_units=1000, active=False)
        self.assertEqual(row["reason"], "paused")
        self.assertEqual(fact["st"], "paused")


    def test_a_paused_backup_beside_a_route_that_refills_each_morning_is_ok(self):
        """600 on the shelf at 500 a day, but the route tops it back up to
        10,000 every morning from a factory holding 20,000: nothing to resume."""
        row, fact, _orders = supply_for(factory_units=20000, depot_units=600, active=False)
        self.assertTrue(row.get("heldUpstream"))
        self.assertEqual((row["level"], row["reason"]), ("ok", None))
        self.assertEqual((fact["st"], fact["why"]), ("covered", "route"))

    def test_a_paused_import_beside_a_route_short_of_the_busiest_day_is_paused(self):
        """With the import paused the route is the whole supply, and a top-up
        to 400 does not cover a 500 day: resume the import."""
        row, fact, _orders = supply_for(factory_units=20000, target=400, depot_units=600,
                                        active=False)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual(row["reason"], "paused")
        self.assertEqual(fact["st"], "paused")

    def test_a_depot_feeding_a_factory_line_is_never_held_upstream(self):
        """The shops' week leaves the line's need out, so the row keeps
        judging the order, as the fact does."""
        row, _fact, _orders = supply_for(factory_units=20000, feeds_line=True)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual(row["orderFit"], "short")


if __name__ == "__main__":
    unittest.main()
