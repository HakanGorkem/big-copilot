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


def supply_for(factory_units, route=True):
    """_supply() over a factory, a depot and a shop with no logged rounds: the
    depot's draw is the shop's sales, and a 1,000 Smart Delivery import is a
    fraction of the week's 3,500."""
    plans = [plan(DEPOT, SHOP, 2000)] + ([plan(FACTORY, DEPOT, 10000)] if route else [])
    save = SaveStub({}, plans, [contract(1000, 1000, smart=True)])

    def business(site, name, kind, status, units, rate):
        return {"key": site_key(site), "name": name, "code": "", "neighbourhood": "",
                "type": kind, "typeSlug": kind, "status": status,
                "lines": [{"slug": FOOD, "item": "Frozen Food", "units": units, "rate": rate,
                           "price": 1 if status == "retail" else 0}]}

    businesses = [
        business(FACTORY, "Food Factory", "factory", "support", factory_units, 0),
        business(DEPOT, "Depot", "warehouse", "support", 9000, 0),
        business(SHOP, "Shop", "supermarket", "retail", 1500, SOLD),
    ]
    supply = _supply(save, Names({}), businesses, DAY, {})
    row = next(r for r in supply["imports"] if r["s"] == 1)
    orders = [n for n in _import_notes(businesses, supply, set()) if n["group"] == "order"]
    return row, orders


class HeldUpstreamTests(unittest.TestCase):
    def test_a_sender_holding_a_week_leaves_the_order_unjudged(self):
        row, orders = supply_for(factory_units=20000)
        self.assertEqual(row["basis"], "sales")
        self.assertTrue(row.get("heldUpstream"))
        self.assertEqual((row["orderFit"], row["level"]), ("ok", "ok"))
        self.assertEqual(orders, [])

    def test_a_sender_holding_less_than_a_week_still_judges_the_order(self):
        row, orders = supply_for(factory_units=1000)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual((row["orderFit"], row["level"], row["reason"]), ("short", "critical", "order"))
        self.assertEqual(len(orders), 1)

    def test_without_a_route_the_order_is_judged(self):
        row, orders = supply_for(factory_units=20000, route=False)
        self.assertNotIn("heldUpstream", row)
        self.assertEqual(row["orderFit"], "short")
        self.assertEqual(len(orders), 1)


if __name__ == "__main__":
    unittest.main()
