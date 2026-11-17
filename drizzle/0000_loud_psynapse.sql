CREATE TYPE "public"."ai_job_kind" AS ENUM('translate', 'summarize', 'classify', 'extract', 'vision');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."ice_fuel" AS ENUM('gasoline', 'diesel', 'lpg');--> statement-breakpoint
CREATE TYPE "public"."image_kind" AS ENUM('exterior', 'interior', 'space', 'detail', 'other');--> statement-breakpoint
CREATE TYPE "public"."image_origin" AS ENUM('upload', 'url');--> statement-breakpoint
CREATE TYPE "public"."powertrain" AS ENUM('ev', 'hev', 'phev', 'ice');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('repair_statement', 'quote', 'service_receipt', 'fuel_receipt', 'insurance', 'registration', 'other');--> statement-breakpoint
CREATE TYPE "public"."part_pref" AS ENUM('oem', 'genuine', 'any');--> statement-breakpoint
CREATE TYPE "public"."quote_source" AS ENUM('phone', 'document', 'manual', 'api');--> statement-breakpoint
CREATE TYPE "public"."repair_request_status" AS ENUM('open', 'chosen', 'done');--> statement-breakpoint
CREATE TYPE "public"."repair_shop_type" AS ENUM('official', 'general', 'specialist');--> statement-breakpoint
CREATE TYPE "public"."shop_source" AS ENUM('kakao', 'google', 'manual');--> statement-breakpoint
CREATE TYPE "public"."check_cycle" AS ENUM('monthly', 'quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."check_method" AS ENUM('self', 'shop', 'both');--> statement-breakpoint
CREATE TYPE "public"."check_type" AS ENUM('status', 'numeric');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('ok', 'warn', 'replace', 'na');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('replace', 'inspect');--> statement-breakpoint
CREATE TYPE "public"."purchase_check_status" AS ENUM('todo', 'ok', 'issue');--> statement-breakpoint
CREATE TYPE "public"."recommend_sort_mode" AS ENUM('popular', 'taste', 'combined');--> statement-breakpoint
CREATE TYPE "public"."wishlist_status" AS ENUM('reviewing', 'dropped', 'finalist');--> statement-breakpoint
CREATE TYPE "public"."recipients_mode" AS ENUM('all', 'primary', 'custom');--> statement-breakpoint
CREATE TYPE "public"."reminder_source" AS ENUM('schedule', 'insurance', 'inspection_followup', 'self_check', 'recall');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('scheduled', 'sent', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "catalog_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"model_id" uuid NOT NULL,
	"trim_id" uuid,
	"kind" "image_kind" DEFAULT 'exterior' NOT NULL,
	"url" text NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"origin" "image_origin" DEFAULT 'upload' NOT NULL,
	"source_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"powertrain" "powertrain" NOT NULL,
	"ice_fuel" "ice_fuel",
	"release_year" integer,
	"launch_on" date,
	"summary" text,
	"ai_summary" text,
	"price_min" integer,
	"price_max" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_trims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer,
	"subsidy_estimate" integer,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"powertrain_specs" jsonb,
	"pros" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"raw_text" text,
	"ai_status" "ai_job_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_popularity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"model_id" uuid,
	"brand_raw" text,
	"model_raw" text NOT NULL,
	"period" date NOT NULL,
	"sales_count" integer,
	"rank_overall" integer,
	"rank_segment" integer,
	"source" text,
	"source_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"kind" "ai_job_kind" NOT NULL,
	"input_ref" text,
	"status" "ai_job_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"notion_page_id" text NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charging_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"charged_on" date NOT NULL,
	"kwh" double precision,
	"cost" integer,
	"charge_type" text,
	"place" text,
	"odometer_km" integer,
	"receipt_document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"service_record_id" uuid,
	"kind" "document_kind" DEFAULT 'repair_statement' NOT NULL,
	"ocr_text" text,
	"ocr_json" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fueling_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"fueled_on" date NOT NULL,
	"liters" double precision,
	"fuel_grade" text,
	"cost" integer,
	"place" text,
	"odometer_km" integer,
	"receipt_document_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"insurer" text NOT NULL,
	"policy_no" text,
	"coverage_type" text,
	"start_on" date,
	"end_on" date NOT NULL,
	"premium" integer,
	"contact" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mileage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"recorded_on" date NOT NULL,
	"mileage_km" integer NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"total_amount" integer NOT NULL,
	"parts_amount" integer,
	"labor_amount" integer,
	"tax_amount" integer,
	"part_type" text,
	"warranty_months" integer,
	"valid_until" date,
	"source" "quote_source" DEFAULT 'manual' NOT NULL,
	"document_id" uuid,
	"distance_km" double precision,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"item_code" text,
	"description" text,
	"part_pref" "part_pref" DEFAULT 'any' NOT NULL,
	"origin_lat" double precision,
	"origin_lng" double precision,
	"radius_km" integer DEFAULT 40 NOT NULL,
	"shop_types" text[],
	"status" "repair_request_status" DEFAULT 'open' NOT NULL,
	"chosen_quote_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_requests_radius_chk" CHECK ("repair_requests"."radius_km" between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "repair_shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"type" "repair_shop_type" DEFAULT 'general' NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"phone" text,
	"external_id" text,
	"source" "shop_source" DEFAULT 'manual' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"serviced_on" date NOT NULL,
	"mileage_km" integer,
	"item_code" text,
	"category" text,
	"shop_id" uuid,
	"shop_name" text,
	"description" text,
	"cost" integer,
	"next_due_on" date,
	"next_due_km" integer,
	"repair_quote_id" uuid,
	"ai_summary" text,
	"notion_page_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"plate_no" text NOT NULL,
	"nickname" text,
	"brand" text,
	"model" text,
	"trim" text,
	"powertrain" "powertrain" NOT NULL,
	"ice_fuel" "ice_fuel",
	"purchase_year" integer,
	"purchased_at" date,
	"vin" text,
	"color" text,
	"current_mileage_km" integer DEFAULT 0 NOT NULL,
	"owner_user_id" text,
	"notes" text,
	"source" "data_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"last_recall_checked_on" date,
	"recall_status" text,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_record_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"item_code" text,
	"item_name" text NOT NULL,
	"category" text,
	"status" "inspection_status" DEFAULT 'ok' NOT NULL,
	"value_num" double precision,
	"unit" text,
	"note" text,
	"follow_up_due_on" date
);
--> statement-breakpoint
CREATE TABLE "inspection_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"template_id" uuid,
	"inspected_on" date NOT NULL,
	"mileage_km" integer,
	"place" text,
	"is_self_check" boolean DEFAULT false NOT NULL,
	"overall_status" "inspection_status",
	"memo" text,
	"service_record_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"check_type" "check_type" DEFAULT 'status' NOT NULL,
	"unit" text,
	"powertrains" "powertrain"[],
	"sort_order" integer DEFAULT 0 NOT NULL,
	"top_rank" integer,
	"self_check_cycle" "check_cycle",
	"check_method" "check_method",
	"verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"source" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_item_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"item_code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"powertrains" "powertrain"[],
	"default_interval_km" integer,
	"default_interval_months" integer,
	"est_rank" integer,
	"verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_maintenance_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"kind" "schedule_kind" DEFAULT 'replace' NOT NULL,
	"interval_km" integer,
	"interval_months" integer,
	"last_done_on" date,
	"last_done_km" integer,
	"next_due_on" date,
	"next_due_km" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"trim_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"ai_summary" text,
	"notion_page_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"body_types" text[],
	"powertrains" "powertrain"[],
	"powertrain_decided" boolean DEFAULT false NOT NULL,
	"priority_features" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"criteria_code" text NOT NULL,
	"status" "purchase_check_status" DEFAULT 'todo' NOT NULL,
	"score" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_checks_score_chk" CHECK ("purchase_checks"."score" is null or "purchase_checks"."score" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "purchase_criteria_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"question" text,
	"powertrains" "powertrain"[],
	"extra_questions" jsonb,
	"default_weight" integer DEFAULT 3 NOT NULL,
	"est_rank" integer
);
--> statement-breakpoint
CREATE TABLE "purchase_criteria_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"criteria_code" text NOT NULL,
	"weight" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"include_subsidy" boolean DEFAULT true NOT NULL,
	"powertrains" "powertrain"[],
	"segments" text[],
	"sort_mode" "recommend_sort_mode" DEFAULT 'popular' NOT NULL,
	"weights" jsonb,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trim_id" uuid NOT NULL,
	"rating" smallint,
	"memo" text,
	"status" "wishlist_status" DEFAULT 'reviewing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_rating_chk" CHECK ("wishlist"."rating" is null or "wishlist"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "monthly_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid,
	"month" date NOT NULL,
	"amount" integer NOT NULL,
	"alert_pct" integer DEFAULT 80 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"offsets_days" integer[] DEFAULT '{30,7}'::integer[] NOT NULL,
	"send_time" time DEFAULT '09:00' NOT NULL,
	"quiet_start" time,
	"quiet_end" time,
	"categories" jsonb DEFAULT '{"schedule":true,"inspection":true,"followup":true,"insurance":true,"selfCheck":false}'::jsonb NOT NULL,
	"recipients_mode" "recipients_mode" DEFAULT 'all' NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reminder_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"deep_link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid,
	"source_type" "reminder_source" NOT NULL,
	"source_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"offset_days" integer NOT NULL,
	"remind_on" date NOT NULL,
	"status" "reminder_status" DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"options" jsonb,
	"period" text,
	"pdf_key" text,
	"share_token" text,
	"expires_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_model_id_catalog_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."catalog_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_trim_id_catalog_trims_id_fk" FOREIGN KEY ("trim_id") REFERENCES "public"."catalog_trims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_models" ADD CONSTRAINT "catalog_models_brand_id_catalog_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."catalog_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_trims" ADD CONSTRAINT "catalog_trims_model_id_catalog_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."catalog_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_popularity" ADD CONSTRAINT "model_popularity_model_id_catalog_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."catalog_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_logs" ADD CONSTRAINT "charging_logs_receipt_document_id_documents_id_fk" FOREIGN KEY ("receipt_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_service_record_id_service_records_id_fk" FOREIGN KEY ("service_record_id") REFERENCES "public"."service_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fueling_logs" ADD CONSTRAINT "fueling_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fueling_logs" ADD CONSTRAINT "fueling_logs_receipt_document_id_documents_id_fk" FOREIGN KEY ("receipt_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_logs" ADD CONSTRAINT "mileage_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_quotes" ADD CONSTRAINT "repair_quotes_request_id_repair_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."repair_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_quotes" ADD CONSTRAINT "repair_quotes_shop_id_repair_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."repair_shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_quotes" ADD CONSTRAINT "repair_quotes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_chosen_quote_id_repair_quotes_id_fk" FOREIGN KEY ("chosen_quote_id") REFERENCES "public"."repair_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_shop_id_repair_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."repair_shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_repair_quote_id_repair_quotes_id_fk" FOREIGN KEY ("repair_quote_id") REFERENCES "public"."repair_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_record_items" ADD CONSTRAINT "inspection_record_items_record_id_inspection_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."inspection_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_records" ADD CONSTRAINT "inspection_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_records" ADD CONSTRAINT "inspection_records_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_records" ADD CONSTRAINT "inspection_records_service_record_id_service_records_id_fk" FOREIGN KEY ("service_record_id") REFERENCES "public"."service_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_template_items" ADD CONSTRAINT "inspection_template_items_template_id_inspection_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_maintenance_schedules" ADD CONSTRAINT "vehicle_maintenance_schedules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_checks" ADD CONSTRAINT "purchase_checks_wishlist_id_wishlist_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_trim_id_catalog_trims_id_fk" FOREIGN KEY ("trim_id") REFERENCES "public"."catalog_trims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_brands_uq" ON "catalog_brands" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "catalog_images_model_idx" ON "catalog_images" USING btree ("model_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_images_one_cover_uq" ON "catalog_images" USING btree ("model_id") WHERE "catalog_images"."is_cover" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_models_uq" ON "catalog_models" USING btree ("org_id","brand_id","name");--> statement-breakpoint
CREATE INDEX "catalog_models_brand_idx" ON "catalog_models" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "catalog_models_price_idx" ON "catalog_models" USING btree ("org_id","price_min","price_max");--> statement-breakpoint
CREATE INDEX "catalog_trims_model_idx" ON "catalog_trims" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "catalog_trims_price_idx" ON "catalog_trims" USING btree ("org_id","price");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_categories_uq" ON "feature_categories" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "model_popularity_org_period_idx" ON "model_popularity" USING btree ("org_id","period");--> statement-breakpoint
CREATE INDEX "model_popularity_model_idx" ON "model_popularity" USING btree ("model_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "notion_links_entity_uq" ON "notion_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "charging_logs_vehicle_date_idx" ON "charging_logs" USING btree ("vehicle_id","charged_on");--> statement-breakpoint
CREATE INDEX "document_images_doc_idx" ON "document_images" USING btree ("document_id","sort_order");--> statement-breakpoint
CREATE INDEX "documents_vehicle_idx" ON "documents" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "documents_service_idx" ON "documents" USING btree ("service_record_id");--> statement-breakpoint
CREATE INDEX "fueling_logs_vehicle_date_idx" ON "fueling_logs" USING btree ("vehicle_id","fueled_on");--> statement-breakpoint
CREATE INDEX "insurance_end_idx" ON "insurance_policies" USING btree ("end_on");--> statement-breakpoint
CREATE INDEX "insurance_vehicle_idx" ON "insurance_policies" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "mileage_logs_vehicle_date_idx" ON "mileage_logs" USING btree ("vehicle_id","recorded_on");--> statement-breakpoint
CREATE INDEX "repair_quotes_request_amount_idx" ON "repair_quotes" USING btree ("request_id","total_amount");--> statement-breakpoint
CREATE INDEX "repair_requests_vehicle_idx" ON "repair_requests" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "repair_shops_geo_idx" ON "repair_shops" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "repair_shops_external_idx" ON "repair_shops" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "service_records_vehicle_date_idx" ON "service_records" USING btree ("vehicle_id","serviced_on");--> statement-breakpoint
CREATE INDEX "service_records_org_item_idx" ON "service_records" USING btree ("org_id","item_code");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_plate_uq" ON "vehicles" USING btree ("org_id","plate_no") WHERE "vehicles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "vehicles_org_idx" ON "vehicles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inspection_record_items_idx" ON "inspection_record_items" USING btree ("record_id","status");--> statement-breakpoint
CREATE INDEX "inspection_records_vehicle_date_idx" ON "inspection_records" USING btree ("vehicle_id","inspected_on");--> statement-breakpoint
CREATE INDEX "inspection_template_items_tpl_idx" ON "inspection_template_items" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_template_items_code_uq" ON "inspection_template_items" USING btree ("template_id","item_code");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_item_presets_uq" ON "maintenance_item_presets" USING btree ("org_id","item_code");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_schedules_uq" ON "vehicle_maintenance_schedules" USING btree ("vehicle_id","item_code","kind");--> statement-breakpoint
CREATE INDEX "vehicle_schedules_due_idx" ON "vehicle_maintenance_schedules" USING btree ("vehicle_id","next_due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "preferences_org_user_uq" ON "preferences" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_checks_uq" ON "purchase_checks" USING btree ("user_id","wishlist_id","criteria_code");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_criteria_presets_uq" ON "purchase_criteria_presets" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_criteria_weights_uq" ON "purchase_criteria_weights" USING btree ("user_id","criteria_code");--> statement-breakpoint
CREATE INDEX "recommendation_runs_user_idx" ON "recommendation_runs" USING btree ("org_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_user_trim_uq" ON "wishlist" USING btree ("user_id","trim_id");--> statement-breakpoint
CREATE INDEX "wishlist_org_user_idx" ON "wishlist" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budgets_uq" ON "monthly_budgets" USING btree ("org_id","vehicle_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_user_uq" ON "notification_settings" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_dedupe_uq" ON "reminders" USING btree ("source_type","source_id","due_on","offset_days");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("remind_on","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_share_token_uq" ON "reports" USING btree ("share_token");