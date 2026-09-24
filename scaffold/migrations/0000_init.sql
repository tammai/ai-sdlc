CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message` text NOT NULL,
	`page` text,
	`reported_by` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
