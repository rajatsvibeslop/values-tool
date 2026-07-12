CREATE TABLE `application_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `claim_sources` (
	`claim_id` text NOT NULL,
	`event_id` text NOT NULL,
	`relationship` text NOT NULL,
	PRIMARY KEY(`claim_id`, `event_id`, `relationship`),
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `comparison_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`value_id` text,
	`text` text NOT NULL,
	`claim_type` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text NOT NULL,
	`creation_method` text NOT NULL,
	`supersedes_claim_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `claims_value_idx` ON `claims` (`value_id`);--> statement-breakpoint
CREATE INDEX `claims_status_idx` ON `claims` (`status`);--> statement-breakpoint
CREATE TABLE `comparison_event_contexts` (
	`event_id` text NOT NULL,
	`context_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `context_id`),
	FOREIGN KEY (`event_id`) REFERENCES `comparison_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_context_context_idx` ON `comparison_event_contexts` (`context_id`);--> statement-breakpoint
CREATE TABLE `comparison_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`value_set_id` text NOT NULL,
	`left_value_id` text NOT NULL,
	`right_value_id` text NOT NULL,
	`result` text NOT NULL,
	`strength` text DEFAULT 'moderate' NOT NULL,
	`confidence` text DEFAULT 'confident' NOT NULL,
	`consideration` text DEFAULT 'intrinsic' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`related_event_ids` text DEFAULT '[]' NOT NULL,
	`supersedes_event_id` text,
	`correction_reason` text DEFAULT '' NOT NULL,
	`erroneous` integer DEFAULT false NOT NULL,
	`selection_reason` text DEFAULT 'manual' NOT NULL,
	`left_presented_first` integer DEFAULT true NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `comparison_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_set_id`) REFERENCES `value_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`left_value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`right_value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_set_time_idx` ON `comparison_events` (`value_set_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `events_pair_idx` ON `comparison_events` (`left_value_id`,`right_value_id`);--> statement-breakpoint
CREATE INDEX `events_session_idx` ON `comparison_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `events_supersedes_idx` ON `comparison_events` (`supersedes_event_id`);--> statement-breakpoint
CREATE TABLE `comparison_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`note_type` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `comparison_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_event_idx` ON `comparison_notes` (`event_id`);--> statement-breakpoint
CREATE TABLE `comparison_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`left_value_id` text NOT NULL,
	`right_value_id` text NOT NULL,
	`reason` text NOT NULL,
	`score` real NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `comparison_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`left_value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`right_value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_position_unique` ON `comparison_queue` (`session_id`,`position`);--> statement-breakpoint
CREATE TABLE `comparison_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`value_set_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`before_snapshot_id` text,
	`after_snapshot_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`value_set_id`) REFERENCES `value_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `comparison_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `sessions_set_idx` ON `comparison_sessions` (`value_set_id`);--> statement-breakpoint
CREATE TABLE `contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contexts_name_unique` ON `contexts` (`name`);--> statement-breakpoint
CREATE TABLE `definition_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`value_id` text NOT NULL,
	`short_definition` text NOT NULL,
	`source_definition` text NOT NULL,
	`personal_definition` text NOT NULL,
	`change_note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `revisions_value_time_idx` ON `definition_revisions` (`value_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `manual_tier_values` (
	`tier_id` text NOT NULL,
	`value_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`tier_id`, `value_id`),
	FOREIGN KEY (`tier_id`) REFERENCES `manual_tiers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `manual_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`value_set_id` text NOT NULL,
	`context_id` text,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`value_set_id`) REFERENCES `value_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`citation` text NOT NULL,
	`license_note` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presets_slug_unique` ON `presets` (`slug`);--> statement-breakpoint
CREATE TABLE `rating_snapshot_entries` (
	`snapshot_id` text NOT NULL,
	`value_id` text NOT NULL,
	`mu` real NOT NULL,
	`sigma` real NOT NULL,
	`rank` integer NOT NULL,
	`comparisons` integer NOT NULL,
	PRIMARY KEY(`snapshot_id`, `value_id`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `rating_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rating_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`value_set_id` text NOT NULL,
	`context_id` text,
	`scope_key` text NOT NULL,
	`reason` text NOT NULL,
	`event_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`value_set_id`) REFERENCES `value_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `comparison_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_set_time_idx` ON `rating_snapshots` (`value_set_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`value_set_id` text NOT NULL,
	`value_id` text NOT NULL,
	`context_id` text,
	`scope_key` text NOT NULL,
	`mu` real NOT NULL,
	`sigma` real NOT NULL,
	`comparisons` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`ties` integer DEFAULT 0 NOT NULL,
	`incomparable` integer DEFAULT 0 NOT NULL,
	`last_compared_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`value_set_id`) REFERENCES `value_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rating_scope_unique` ON `ratings` (`value_set_id`,`value_id`,`scope_key`);--> statement-breakpoint
CREATE INDEX `rating_scope_idx` ON `ratings` (`value_set_id`,`scope_key`);--> statement-breakpoint
CREATE TABLE `session_contexts` (
	`session_id` text NOT NULL,
	`context_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `context_id`),
	FOREIGN KEY (`session_id`) REFERENCES `comparison_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tension_contexts` (
	`tension_id` text NOT NULL,
	`context_id` text NOT NULL,
	PRIMARY KEY(`tension_id`, `context_id`),
	FOREIGN KEY (`tension_id`) REFERENCES `tensions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tension_sources` (
	`tension_id` text NOT NULL,
	`event_id` text NOT NULL,
	`relationship` text NOT NULL,
	PRIMARY KEY(`tension_id`, `event_id`, `relationship`),
	FOREIGN KEY (`tension_id`) REFERENCES `tensions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `comparison_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tension_values` (
	`tension_id` text NOT NULL,
	`value_id` text NOT NULL,
	PRIMARY KEY(`tension_id`, `value_id`),
	FOREIGN KEY (`tension_id`) REFERENCES `tensions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tensions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`detection_type` text NOT NULL,
	`user_notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tensions_status_idx` ON `tensions` (`status`);--> statement-breakpoint
CREATE TABLE `value_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`value_id` text NOT NULL,
	`alias` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `value_alias_unique` ON `value_aliases` (`value_id`,`alias`);--> statement-breakpoint
CREATE INDEX `value_alias_text_idx` ON `value_aliases` (`alias`);--> statement-breakpoint
CREATE TABLE `value_set_memberships` (
	`value_set_id` text NOT NULL,
	`value_id` text NOT NULL,
	`source_metadata` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`value_set_id`, `value_id`),
	FOREIGN KEY (`value_set_id`) REFERENCES `value_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_value_idx` ON `value_set_memberships` (`value_id`);--> statement-breakpoint
CREATE TABLE `value_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source_type` text NOT NULL,
	`source_metadata` text DEFAULT '{}' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `values` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_definition` text DEFAULT '' NOT NULL,
	`source_definition` text DEFAULT '' NOT NULL,
	`personal_definition` text DEFAULT '' NOT NULL,
	`source_taxonomy` text DEFAULT '' NOT NULL,
	`source_identifier` text DEFAULT '' NOT NULL,
	`parent_category` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `values_name_idx` ON `values` (`name`);--> statement-breakpoint
CREATE INDEX `values_taxonomy_idx` ON `values` (`source_taxonomy`);