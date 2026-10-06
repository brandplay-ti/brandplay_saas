ALTER TABLE public.brandtrack_detections
ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by UUID,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS corrected_brand_name TEXT,
ADD COLUMN IF NOT EXISTS corrected_exposure_type TEXT;

CREATE INDEX IF NOT EXISTS idx_brandtrack_detections_review_status
ON public.brandtrack_detections (review_status);

CREATE INDEX IF NOT EXISTS idx_brandtrack_detections_media_time
ON public.brandtrack_detections (media_id, start_time);

CREATE INDEX IF NOT EXISTS idx_brandtrack_detections_reviewed_by
ON public.brandtrack_detections (reviewed_by);