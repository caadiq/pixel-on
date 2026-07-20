CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`streamer_id` int NOT NULL,
	`platform` enum('chzzk','soop') NOT NULL,
	`title` varchar(300) NOT NULL DEFAULT '',
	`category` varchar(100),
	`started_at` datetime NOT NULL,
	`ended_at` datetime,
	`peak_viewers` int NOT NULL DEFAULT 0,
	`accumulate` int,
	`source` enum('poll','backfill') NOT NULL DEFAULT 'poll',
	`vod_id` varchar(64),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`at` datetime NOT NULL,
	`viewers` int NOT NULL,
	CONSTRAINT `snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `streamers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`platform` enum('chzzk','soop') NOT NULL,
	`chzzk_id` varchar(64),
	`soop_id` varchar(64),
	`profile_image` varchar(500) NOT NULL DEFAULT '',
	`followers` int NOT NULL DEFAULT 0,
	`color` varchar(9),
	`auto_color` varchar(9),
	`active` boolean NOT NULL DEFAULT true,
	`sort_name` varchar(50) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `streamers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_streamer_started` ON `sessions` (`streamer_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_started` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_session` ON `snapshots` (`session_id`);