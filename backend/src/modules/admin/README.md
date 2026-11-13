# admin (planned: Sprint 5)

Admin console API: lead pipeline, content management, user support, exports. Every route requires an
authenticated admin session with a second factor, and every mutation writes to `audit`.
