-- Assign a sequential 'orden' to all categories based on alphabetical order of their names
WITH numbered_categories AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nombre ASC) - 1 as new_orden
  FROM public.categories
)
UPDATE public.categories c
SET orden = nc.new_orden
FROM numbered_categories nc
WHERE c.id = nc.id;
