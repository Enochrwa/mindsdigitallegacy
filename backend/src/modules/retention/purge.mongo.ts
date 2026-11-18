import { Types, trusted } from "mongoose";
import { EntitlementModel, RedemptionModel } from "../access/access.model.js";
import { AuthTokenModel } from "../auth/authTokens.js";
import { ApplicationModel, PlacementModel } from "../internships/internships.model.js";
import { EnrolmentModel, ProgressModel } from "../courses/courses.model.js";
import {
  ReferralCodeModel,
  ReferralEventModel,
  ReferralModel,
} from "../referrals/referrals.model.js";
import { SessionModel } from "../sessions/sessions.model.js";
import { UserModel } from "../users/users.model.js";
import type { PurgeCounts, PurgeStore } from "./purge.js";

/**
 * What happens to each collection when an account is purged (keep in step with docs/07-data-model.md):
 *
 *  - internship applications and placements (the person's own, including reviewer notes about them), sessions, auth tokens, enrolments, lesson progress, entitlements, code redemptions, the user's
 *    own referral code and the referral row where they were the invitee: deleted.
 *  - referral events: the funnel log stays for statistics, but the person's id is removed.
 *  - referral rows where they were the referrer: kept (they hold the invitee's data, not theirs); the
 *    referrer id is an opaque id that no longer resolves to anyone.
 *  - audit events: kept as the security record; they hold ids, never emails.
 *  - the user row: deleted last.
 */
export function createMongoPurgeStore(): PurgeStore {
  return {
    async findDeletedBefore(cutoff, limit) {
      const docs = await UserModel.find({ deletedAt: trusted({ $lte: cutoff }) })
        .sort({ deletedAt: 1 })
        .limit(limit)
        .select({ _id: 1 })
        .lean();
      return docs.map((d) => String(d._id));
    },

    async purgeUser(userId) {
      // Guard: only ever purge a row that really is soft-deleted, even if called with a wrong id.
      const target = await UserModel.findOne({
        _id: userId,
        deletedAt: trusted({ $exists: true }),
      })
        .select({ _id: 1 })
        .lean();
      if (target === null) return {};

      const id = new Types.ObjectId(userId);
      const counts: PurgeCounts = {};

      counts["sessions"] = (await SessionModel.deleteMany({ userId: id })).deletedCount;
      counts["authTokens"] = (await AuthTokenModel.deleteMany({ userId: id })).deletedCount;
      counts["enrolments"] = (await EnrolmentModel.deleteMany({ userId: id })).deletedCount;
      counts["lessonProgress"] = (await ProgressModel.deleteMany({ userId: id })).deletedCount;
      counts["entitlements"] = (await EntitlementModel.deleteMany({ userId: id })).deletedCount;
      counts["codeRedemptions"] = (await RedemptionModel.deleteMany({ userId: id })).deletedCount;
      counts["internshipApplications"] = (
        await ApplicationModel.deleteMany({ userId: id })
      ).deletedCount;
      counts["internshipPlacements"] = (
        await PlacementModel.deleteMany({ userId: id })
      ).deletedCount;
      counts["referralCodes"] = (await ReferralCodeModel.deleteMany({ userId: id })).deletedCount;
      counts["referralsAsInvitee"] = (
        await ReferralModel.deleteMany({ inviteeId: id })
      ).deletedCount;
      counts["referralEventsAnonymised"] =
        (await ReferralEventModel.updateMany({ inviteeId: id }, { $unset: { inviteeId: 1 } }))
          .modifiedCount +
        (await ReferralEventModel.updateMany({ referrerId: id }, { $unset: { referrerId: 1 } }))
          .modifiedCount;

      // Last: if anything above threw, the soft-deleted row remains and the next run finishes the job.
      counts["users"] = (await UserModel.deleteOne({ _id: id })).deletedCount;
      return counts;
    },
  };
}
