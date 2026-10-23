-- Hand edits to the generated SQL (keep them in any regenerated version):
-- 1. Tables use utf8mb4_0900_ai_ci, not Prisma's default utf8mb4_unicode_ci, so text
--    comparisons ignore case and accents (spec §3.2, D40).
-- 2. audit_event is append-only: triggers at the end reject UPDATE and DELETE (D38).

-- CreateTable
CREATE TABLE `admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,

    UNIQUE INDEX `admin_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `course` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `title` VARCHAR(200) NOT NULL,

    UNIQUE INDEX `code`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `participant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(254) NOT NULL,

    UNIQUE INDEX `email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `enrollment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `participant_id` INTEGER NOT NULL,
    `course_id` INTEGER NOT NULL,
    `status` ENUM('enrolled', 'completed') NOT NULL DEFAULT 'enrolled',
    `enrolled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `enrollment_course_status_idx`(`course_id`, `status`),
    UNIQUE INDEX `enrollment_participant_course_key`(`participant_id`, `course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `serial_counter` (
    `year` INTEGER NOT NULL,
    `last_value` INTEGER NOT NULL,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `certificate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enrollment_id` INTEGER NOT NULL,
    `participant_id` INTEGER NOT NULL,
    `course_id` INTEGER NOT NULL,
    `serial` VARCHAR(32) NOT NULL,
    `participant_name` VARCHAR(201) NOT NULL,
    `course_title` VARCHAR(200) NOT NULL,
    `status` ENUM('valid', 'revoked') NOT NULL DEFAULT 'valid',
    `issued_at` DATETIME(3) NOT NULL,
    `issued_by` INTEGER NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by` INTEGER NULL,
    `revoke_reason` VARCHAR(500) NULL,

    UNIQUE INDEX `certificate_enrollment_key`(`enrollment_id`),
    UNIQUE INDEX `certificate_serial_key`(`serial`),
    INDEX `certificate_issued_at_id_idx`(`issued_at`, `id`),
    INDEX `certificate_participant_name_idx`(`participant_name`),
    INDEX `certificate_course_title_idx`(`course_title`),
    INDEX `certificate_course_idx`(`course_id`),
    INDEX `certificate_participant_idx`(`participant_id`),
    INDEX `certificate_issued_by_idx`(`issued_by`),
    INDEX `certificate_revoked_by_idx`(`revoked_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `audit_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action` VARCHAR(64) NOT NULL,
    `actor_id` INTEGER NOT NULL,
    `actor_name` VARCHAR(200) NOT NULL,
    `course_id` INTEGER NOT NULL,
    `course_title` VARCHAR(200) NOT NULL,
    `participant_id` INTEGER NOT NULL,
    `participant_name` VARCHAR(201) NOT NULL,
    `certificate_id` INTEGER NOT NULL,
    `serial` VARCHAR(32) NOT NULL,
    `details` JSON NULL,

    INDEX `audit_event_occurred_at_id_idx`(`occurred_at`, `id`),
    INDEX `audit_event_certificate_idx`(`certificate_id`, `occurred_at`),
    INDEX `audit_event_course_idx`(`course_id`, `occurred_at`),
    INDEX `audit_event_action_idx`(`action`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `enrollment` ADD CONSTRAINT `enrollment_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment` ADD CONSTRAINT `enrollment_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate` ADD CONSTRAINT `certificate_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate` ADD CONSTRAINT `certificate_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate` ADD CONSTRAINT `certificate_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate` ADD CONSTRAINT `certificate_issued_by_fkey` FOREIGN KEY (`issued_by`) REFERENCES `admin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate` ADD CONSTRAINT `certificate_revoked_by_fkey` FOREIGN KEY (`revoked_by`) REFERENCES `admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_event` ADD CONSTRAINT `audit_event_certificate_id_fkey` FOREIGN KEY (`certificate_id`) REFERENCES `certificate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only audit log (D38). TRUNCATE does not fire these, so tests can still reset tables.
CREATE TRIGGER `audit_event_no_update` BEFORE UPDATE ON `audit_event`
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_event is append-only: UPDATE is not allowed';

CREATE TRIGGER `audit_event_no_delete` BEFORE DELETE ON `audit_event`
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_event is append-only: DELETE is not allowed';
