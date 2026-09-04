ALTER TYPE "public"."attendance_event_type" ADD VALUE 'break_start';--> statement-breakpoint
ALTER TYPE "public"."attendance_event_type" ADD VALUE 'break_end';--> statement-breakpoint
CREATE TABLE "attendance_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"start_event_id" uuid,
	"end_event_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_events" ADD COLUMN "site_code_verified" boolean;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "break_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "site_code_secret" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "site_code_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_record_id_attendance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."attendance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_start_event_id_attendance_events_id_fk" FOREIGN KEY ("start_event_id") REFERENCES "public"."attendance_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_end_event_id_attendance_events_id_fk" FOREIGN KEY ("end_event_id") REFERENCES "public"."attendance_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_breaks_record_idx" ON "attendance_breaks" USING btree ("record_id");