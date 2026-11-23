import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMongoApplicationRepository,
  createMongoPlacementRepository,
  createMongoPostingRepository,
} from "./internships.mongo.js";
import type { NewApplication, NewPosting } from "./internships.repository.js";

/** Runs against a real MongoDB when MONGODB_TEST_URI is set (CI service container). Skipped otherwise. */
const uri = process.env["MONGODB_TEST_URI"];
const oid = (): string => new Types.ObjectId().toString();
const at = new Date("2026-12-01T10:00:00Z");

const newPosting = (over: Partial<NewPosting> = {}): NewPosting => ({
  slug: `web-${oid().slice(-6)}`,
  title: "Web intern",
  department: "software_web",
  summary: "Summary of the role.",
  description: "A longer description of the role for applicants to read.",
  requirements: ["HTML"],
  learningGoals: ["Ship"],
  mode: "hybrid",
  location: "Kigali",
  durationWeeks: 8,
  hoursPerWeek: 20,
  compensation: "unpaid",
  compensationNote: "",
  minAge: 16,
  slots: 2,
  skills: [],
  responsibilities: [],
  whoCanApply: [],
  perks: [],
  screeningQuestions: [],
  supervisorIds: [oid()],
  status: "published",
  createdBy: oid(),
  ...over,
});

const newApplication = (postingId: string, userId: string): NewApplication => ({
  postingId,
  userId,
  statement: "A statement that is long enough to be a real application.",
  links: ["https://example.com/me"],
  under18: false,
  status: "submitted",
  events: [{ at, by: userId, from: null, to: "submitted" }],
  consentNoticeVersion: "2026-11",
  consentAt: at,
  answers: [],
});

describe.skipIf(uri === undefined)("internships (integration)", () => {
  const postings = createMongoPostingRepository();
  const applications = createMongoApplicationRepository();
  const placements = createMongoPlacementRepository();

  beforeAll(async () => {
    mongoose.set("sanitizeFilter", true);
    await mongoose.connect(uri as string, { dbName: `mdl_intern_${String(Date.now())}` });
    await mongoose.syncIndexes();
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("stores and reads a posting, and enforces unique slugs", async () => {
    const created = await postings.create(newPosting({ slug: "unique-slug" }));
    expect((await postings.findBySlug("unique-slug"))?.id).toBe(created.id);
    expect(await postings.slugExists("unique-slug")).toBe(true);
    await expect(postings.create(newPosting({ slug: "unique-slug" }))).rejects.toThrow();
    expect((await postings.findById("not-an-id")) ?? null).toBeNull();
  });

  it("lists published postings and counts by status", async () => {
    await postings.create(newPosting({ status: "draft" }));
    expect((await postings.listPublished()).every((p) => p.status === "published")).toBe(true);
    const counts = await postings.countByStatus();
    expect(counts.draft).toBeGreaterThanOrEqual(1);
  });

  it("allows one application per person per posting", async () => {
    const posting = await postings.create(newPosting());
    const user = oid();
    await applications.create(newApplication(posting.id, user));
    await expect(applications.create(newApplication(posting.id, user))).rejects.toThrow(
      "DUPLICATE",
    );
    expect((await applications.findByPostingAndUser(posting.id, user))?.status).toBe("submitted");
  });

  it("moves status only from the expected state, so racing writers cannot both win", async () => {
    const posting = await postings.create(newPosting());
    const app = await applications.create(newApplication(posting.id, oid()));
    const move = (by: string) =>
      applications.transition(app.id, "submitted", {
        at,
        by,
        from: "submitted",
        to: "shortlisted",
      });
    const results = await Promise.all([move("a"), move("b")]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const stored = await applications.findById(app.id);
    expect(stored?.status).toBe("shortlisted");
    expect(stored?.events).toHaveLength(2); // submitted + exactly one shortlisted
  });

  it("keeps notes on the application and counts by status", async () => {
    const posting = await postings.create(newPosting());
    const app = await applications.create(newApplication(posting.id, oid()));
    await applications.addNote(app.id, { at, by: oid(), text: "Good", score: 4 }, at);
    expect((await applications.findById(app.id))?.notes[0]?.score).toBe(4);
    expect((await applications.countByStatus(posting.id)).submitted).toBe(1);
  });

  it("verifies a guardian only when one exists", async () => {
    const posting = await postings.create(newPosting());
    const adult = await applications.create(newApplication(posting.id, oid()));
    expect(
      await applications.patch(adult.id, { guardianVerified: { at, by: oid() } }, at),
    ).toBeNull();
    const minor = await applications.create({
      ...newApplication(posting.id, oid()),
      under18: true,
      guardian: { name: "Jean", relationship: "father", contact: "0788000000" },
    });
    const done = await applications.patch(minor.id, { guardianVerified: { at, by: oid() } }, at);
    expect(done?.guardian?.verifiedAt).toBeDefined();
  });

  it("allows one placement per application and ends a placement only once", async () => {
    const posting = await postings.create(newPosting());
    const app = await applications.create(newApplication(posting.id, oid()));
    const input = {
      applicationId: app.id,
      postingId: posting.id,
      userId: app.userId,
      supervisorId: oid(),
      startsOn: at,
      endsOn: new Date(at.getTime() + 86_400_000 * 56),
      status: "active" as const,
      agreementVersion: "v1",
      agreementAcceptedAt: at,
      createdBy: oid(),
    };
    const placement = await placements.create(input);
    await expect(placements.create(input)).rejects.toThrow("DUPLICATE");
    expect(await placements.countActiveByPosting(posting.id)).toBe(1);
    expect((await placements.activeLoadBySupervisor())[input.supervisorId]).toBe(1);

    const fb = await placements.addFeedback(
      placement.id,
      { at, by: input.supervisorId, text: "Good work", visibleToIntern: true },
      at,
    );
    expect(fb?.feedback).toHaveLength(1);

    expect((await placements.end(placement.id, "completed", "Done", at))?.status).toBe("completed");
    expect(await placements.end(placement.id, "completed", undefined, at)).toBeNull();
    expect(
      await placements.addFeedback(
        placement.id,
        { at, by: oid(), text: "Late", visibleToIntern: true },
        at,
      ),
    ).toBeNull();
    expect(await placements.countActiveByPosting(posting.id)).toBe(0);
  });
});
