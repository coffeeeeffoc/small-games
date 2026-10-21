# Dynamic Content drafts

Management Service and Creator Studio use an explicitly configured content target. Each Game owns its default envelope, manifest and validation/migration implementation, following ADR-0007. Management receives a `ContentTarget`; Studio receives the matching `StudioContentTarget` including its trusted preview definition. No Game is configured by default.

Without a target, draft inventory and historical reads remain available. Content creation, validation, saving, AI generation, publication and rollback return `503 CONTENT_TARGET_NOT_CONFIGURED`. No generation worker starts, and Studio hides the content editor, generation and publication panels. Existing stored records are preserved.

Configured drafts retain optimistic revision checks, full validation paths, creator/publisher role checks and exact Origin protection. Preview uses a disposable in-memory Game Host with content/storage capabilities and `adAuthority: none`; it never uses player storage or real ads. The preview definition is trusted bundled code.

Run the Management and Studio unit suites to verify target injection, unavailable targets, validation, conflicts and preview cleanup. `scripts/auth.integration.mjs` exercises a separate fixture target with real SQL; it is not a production Game.
