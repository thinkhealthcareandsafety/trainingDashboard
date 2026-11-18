import { test } from "node:test";
import assert from "node:assert/strict";
import { boardColumns, decode, findProject, pickTeam, sprintsOf } from "@/lib/sprintsRules";

// Zoho Sprints on the dashboard (owner, 18 Nov). The answers below are Zoho Sprints' own API reference examples.

const statuses = { status: "success", status_prop: { colorCode: 3, createdBy: 6, createdTime: 7, isDefault: 1, isEnd: 5, isStart: 4, statusName: 0, statusType: 2, wipMax: 9, wipMin: 8 }, statusIds: ["2000000005499", "2000000005501", "2000000005503"], statusJObj: { "2000000005499": ["To do", true, 0, "#fa335c", true, false, "2000000000005", "2024-05-06T06:31:30.573Z", -1, -1], "2000000005501": ["In progress", true, 2, "#4a7297", false, false, "2000000000005", "2024-05-06T06:31:30.573Z", -1, -1], "2000000005503": ["Done", true, 1, "#259e92", false, false, "2000000000005", "2024-05-06T06:31:30.573Z", -1, -1] } };
const items = { next: false, item_prop: { endDate: 6, hasSubHierarchy: 34, isNotesAdded: 10, itemNo: 1, ownerId: 27, addedVia: 17, leftPosition: 7, points: 13, duration: 3, itemName: 0, isOverDue: 28, diffDays: 29, startAfter: 18, createdTime: 16, rightPosition: 8, rootItem: 22, isDocsAdded: 11, projPriorityId: 25, immediateRootId: 32, immediateParentId: 33, isParent: 9, level: 31, directChilds: 30, completedDate: 15, commentCount: 19, sequence: 12, sprintId: 20, depth: 4, statusId: 23, epicId: 26, createdBy: 2, parentItem: 21, projItemTypeId: 24, isOrphanItem: 35, startDate: 5, completedBy: 14 }, itemIds: ["2000000006321", "2000000006323", "2000000006327"], userDisplayName: { "2000000000007": "Unassigned", "2000000000005": "John Doe" }, itemJObj: { "2000000006321": ["As a user, I would like to read some blogs and tips on buying appliances.", "37", "2000000000005", "8h", "0", "-1", "-1", 1, 2, false, false, false, "37", 2, "", "-1", "2024-05-04T06:31:30.707Z", 4, "-1", 0, "2000000006247", "", "", "2000000005499", "2000000006235", "2000000006225", "", ["2000000000007"], false, "", [], 1, "", "", false, false], "2000000006323": ["Promote on social media ", "38", "2000000000005", "5d 12h", "0", "-1", "-1", 1, 4, true, false, false, "38", 1, "", "-1", "2024-05-04T06:31:30.707Z", 4, "-1", 0, "2000000006247", "", "", "2000000005499", "2000000006235", "2000000006227", "", ["2000000000007"], false, "", [], 1, "", "", true, false], "2000000006327": ["Trigger emailers to active users", "40", "2000000000005", "2d 12h", "0", "-1", "-1", 1, 2, false, false, false, "40", 3, "", "2024-04-30T23:00:00.000Z", "2024-05-01T06:31:30.707Z", 4, "-1", 0, "2000000006247", "", "", "2000000005499", "2000000006233", "2000000006227", "", ["2000000000005"], false, "", [], 1, "", "", false, false] }, status: "success" };

test("Zoho Sprints' id-keyed arrays are read by the prop map, in the ids' order", () => {
  const s = decode(statuses.statusIds, statuses.statusJObj, statuses.status_prop);
  assert.deepEqual(s.map((x) => [x.id, x.statusName, x.colorCode]), [["2000000005499", "To do", "#fa335c"], ["2000000005501", "In progress", "#4a7297"], ["2000000005503", "Done", "#259e92"]]);
  assert.deepEqual(decode(undefined, undefined, undefined), []);
});

test("the board: a column per status in Zoho's order, cards in Zoho's sequence, owner names, Unassigned left out", () => {
  const cols = boardColumns(statuses, [items], "SP", new Date("2026-11-18T00:00:00Z"));
  assert.deepEqual(cols.map((c) => [c.name, c.color, c.cards.length]), [["To do", "#fa335c", 3], ["In progress", "#4a7297", 0], ["Done", "#259e92", 0]]);
  assert.deepEqual(cols[0].cards.map((c) => [c.no, c.sequence, c.owners]), [["SP-I37", 37, []], ["SP-I38", 38, []], ["SP-I40", 40, ["John Doe"]]]);
  assert.equal(cols[0].cards[1].name, "Promote on social media ");
  assert.equal(cols[0].cards[2].due, null); // "-1" = no end date
  // An item in a status the board doesn't list goes to "Other"; the same item on two pages counts once.
  const odd = { ...items, itemIds: ["9"], itemJObj: { "9": [...items.itemJObj["2000000006327"]] } };
  odd.itemJObj["9"][23] = "777";
  odd.itemJObj["9"][6] = "2026-11-01T00:00:00.000Z";
  odd.itemJObj["9"][15] = "-1"; // not completed: past its end date = overdue
  const two = boardColumns(statuses, [items, items, odd], "", new Date("2026-11-18T00:00:00Z"));
  assert.equal(two[0].cards.length, 3);
  assert.deepEqual(two.at(-1)!.cards.map((c) => [c.no, c.due, c.overdue]), [["I40", "2026-11-01T00:00:00.000Z", true]]);
  assert.equal(two.at(-1)!.name, "Other");
});

test("the project by its number (the P5 in the board's address), its prefix and backlog; the workspace; active sprints", () => {
  const projects = { next: false, prefixObj: { "2000000006193": "SP" }, project_prop: { addedVia: 14, archivedOn: 12, backlogId: 13, commentCount: 15, createdBy: 7, createdTime: 6, defaultTab: 23, diffDays: 22, endDate: 3, estimationType: 4, favouriteType: 17, groupId: 20, isNtfnMuted: 19, isOverDue: 21, lastAccessedTime: 18, owner: 5, profileId: 16, projName: 0, projNo: 1, projType: 8, sequence: 10, stageId: 11, startDate: 2, status: 9 }, projectIds: ["2000000006193"], projectJObj: { "2000000006193": ["Sample Project", "1", "-1", "-1", 0, "2000000000005", "2024-05-06T06:31:30.573Z", "2000000000005", 1, 1, "1", "2000000005727", "", "2000000006199", 23, 0, "2000000000013", 0, "2024-05-09T07:42:33.932Z", false, "2000000005745", false, "", "backlog"] }, status: "success" };
  assert.deepEqual(findProject(projects, "1"), { id: "2000000006193", name: "Sample Project", prefix: "SP", no: "1", backlogId: "2000000006199" });
  assert.equal(findProject(projects, "5"), null);
  assert.equal(pickTeam({ myTeamId: "1", portals: [{ teamName: "other", zsoid: "1" }, { teamName: "ThinkHealth", zsoid: "2" }] }), "2");
  assert.equal(pickTeam({ myTeamId: "1", portals: [{ teamName: "other", zsoid: "1" }] }), "1");
  const sprints = { next: false, sprint_prop: { canceledBy: 13, canceledOn: 12, completedBy: 11, completedOn: 10, createdBy: 8, createdTime: 9, diffDays: 23, duration: 6, endDate: 5, isOverDue: 22, isRolled: 16, itemMailAlias: 24, projectId: 18, scrumMaster: 3, sequence: 19, sprintId: 20, sprintName: 0, sprintNo: 1, sprintNotesAlias: 25, sprintType: 2, startAfter: 7, startDate: 4, startedOn: 15, userId: 21, workflowId: 14 }, sprintIds: ["2000000006247"], sprintJObj: { "2000000006247": ["Marketing", "4", 1, "2000000000005", "-1", "-1", "14d", "-1", "2000000000005", "2024-05-06T06:31:30.700Z", "-1", "", "-1", "", "2000000006192", "-1", false, "2000000006247", "2000000006193", "3", "2000000006247", "2000000000005", "", -1] }, status: "success" };
  assert.deepEqual(sprintsOf(sprints), [{ id: "2000000006247", name: "Marketing", no: "4", start: null, end: null }]);
});

test("a Kanban board read item by item (Get multiple item details: other field positions) fills the same columns", () => {
  const prop = { endDate: 7, description: 3, isNotesAdded: 10, itemNo: 17, ownerId: 31, addedVia: 5, hasCheckList: 23, leftPosition: 15, points: 18, duration: 20, itemName: 1, startAfter: 22, createdTime: 19, isIntegrated: 12, rightPosition: 16, rootItem: 25, isDocsAdded: 11, projPriorityId: 30, isParent: 13, completedDate: 8, itemId: 0, sequence: 2, sprintId: 26, depth: 14, epicId: 24, statusId: 28, createdBy: 4, parentItem: 27, projItemTypeId: 29, startDate: 6, completedBy: 21 };
  const row = (id: string, name: string, no: string, status: string, owner: string) => { const r: unknown[] = Array(32).fill(""); r[0] = id; r[1] = name; r[2] = no; r[7] = "-1"; r[8] = "-1"; r[17] = no; r[26] = "k1"; r[28] = status; r[31] = [owner]; return r; };
  const page = { itemIds: ["a", "b"], item_prop: prop, userDisplayName: { u1: "Shreya" }, itemJObj: { a: row("a", "Make ID cards design", "157", "2000000005503", "u1"), b: row("b", "Replay to Zoho Mail", "154", "2000000005499", "u1") } };
  const cols = boardColumns(statuses, [page], "GT");
  assert.deepEqual(cols.map((c) => [c.name, c.cards.map((x) => `${x.no} ${x.name} ${x.owners.join(",")}`)]), [["To do", ["GT-I154 Replay to Zoho Mail Shreya"]], ["In progress", []], ["Done", ["GT-I157 Make ID cards design Shreya"]]]);
});
