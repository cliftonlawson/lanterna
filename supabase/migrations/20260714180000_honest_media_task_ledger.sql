-- Repair generate_web_copy history without claiming deferred work occurred.

UPDATE public.media_tasks AS task
SET status = 'failed',
    last_error = 'Target video no longer exists; web copy was not generated.',
    updated_at = now()
WHERE task.task_type = 'generate_web_copy'
  AND (
    task.video_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.videos AS video
      WHERE video.id = task.video_id
    )
  );

UPDATE public.media_tasks AS task
SET status = 'pending',
    last_error = NULL,
    run_after = now(),
    updated_at = now()
WHERE task.task_type = 'generate_web_copy'
  AND EXISTS (
    SELECT 1
    FROM public.videos AS video
    WHERE video.id = task.video_id
      AND video.web_copy_r2_key IS NULL
  );

-- A task may remain done only when its target still carries a real web copy.
UPDATE public.media_tasks AS task
SET status = 'done',
    last_error = NULL,
    updated_at = now()
WHERE task.task_type = 'generate_web_copy'
  AND EXISTS (
    SELECT 1
    FROM public.videos AS video
    WHERE video.id = task.video_id
      AND video.web_copy_r2_key IS NOT NULL
  );
