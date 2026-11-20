import { z } from "zod";

/** A habit's state on one day; precedence when marks disagree is documented in `decisions.md`. */
export const HabitState = z.enum(["pending", "done", "delayed", "skipped", "missed"]);

const Rating = z.number().int().min(1).max(10).nullable();
const LocalTime = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);

/**
 * `roots/1`: the frontmatter of a Roots daily note. Roots owns the first six keys and
 * Discretion the keys from `discretion` down; keys Pranshul adds are kept as they are.
 */
export const RootsDaily = z
  .object({
    roots: z.literal(1),
    date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
    /** 1 to 10; empty until set. */
    rating: Rating,
    /** A few words naming the day; empty until set. */
    alias: z.string().nullable(),
    /** The local model's nightly suggestions; only Pranshul's Accept moves them. */
    aiRating: Rating,
    aiAlias: z.string().nullable(),
    discretion: z.literal(1),
    /** Habit id to state. */
    habits: z.record(z.string(), HabitState),
    /** Habit id to the local `HH:MM` a check habit was marked done. */
    habitTimes: z.record(z.string(), LocalTime),
    /** Quantity habits only: minutes logged. */
    habitMinutes: z.record(z.string(), z.number().nonnegative()),
    /** Quantity habits only: `timed` or `self-reported`. */
    habitSource: z.record(z.string(), z.enum(["timed", "self-reported"])),
    /** Habit id to the reason given when skipped. */
    skipReasons: z.record(z.string(), z.string()),
    /** Set on a note derived from private content. */
    private: z.boolean().optional(),
  })
  .passthrough();

export type RootsDaily = z.infer<typeof RootsDaily>;
