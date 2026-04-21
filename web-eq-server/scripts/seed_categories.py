"""
Seed script — inserts initial categories and services for India.

Usage (from web-eq-server/):
    python -m scripts.seed_categories

Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
Never deletes existing data.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, engine, Base

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


# ── Seed data ────────────────────────────────────────────────────────────────

@dataclass
class ServiceDef:
    name: str
    description: str


@dataclass
class SubCategoryDef:
    name: str
    description: str
    services: list[ServiceDef] = field(default_factory=list)


@dataclass
class MainCategoryDef:
    name: str
    description: str
    subcategories: list[SubCategoryDef] = field(default_factory=list)


SEED: list[MainCategoryDef] = [
    MainCategoryDef(
        name="Healthcare & Medical",
        description="Hospitals, clinics, diagnostics, and specialist consultations.",
        subcategories=[
            SubCategoryDef(
                name="General Physician",
                description="Family doctors and general practitioners.",
                services=[
                    ServiceDef("General Consultation",  "Routine medical check-up and advice."),
                    ServiceDef("Follow-up Visit",       "Follow-up on an existing diagnosis or treatment."),
                    ServiceDef("Annual Health Checkup", "Comprehensive yearly health assessment."),
                    ServiceDef("Prescription Renewal",  "Renewal of existing prescriptions."),
                ],
            ),
            SubCategoryDef(
                name="Dental Care",
                description="Dentists and oral health specialists.",
                services=[
                    ServiceDef("Dental Checkup",        "Routine dental examination."),
                    ServiceDef("Teeth Cleaning",        "Professional scaling and polishing."),
                    ServiceDef("Tooth Filling",         "Cavity filling with composite or amalgam."),
                    ServiceDef("Root Canal Treatment",  "Removal of infected pulp tissue."),
                    ServiceDef("Tooth Extraction",      "Simple or surgical tooth removal."),
                    ServiceDef("Braces Consultation",   "Orthodontic assessment and planning."),
                    ServiceDef("Teeth Whitening",       "Professional bleaching and whitening."),
                ],
            ),
            SubCategoryDef(
                name="Eye Care",
                description="Ophthalmologists and optometrists.",
                services=[
                    ServiceDef("Eye Checkup",              "Complete vision and eye health examination."),
                    ServiceDef("Glasses Prescription",     "Refraction test and spectacle prescription."),
                    ServiceDef("Contact Lens Fitting",     "Fitting and trial for contact lenses."),
                    ServiceDef("Eye Test (Children)",      "Paediatric vision screening."),
                ],
            ),
            SubCategoryDef(
                name="Skin & Hair",
                description="Dermatologists and trichologists.",
                services=[
                    ServiceDef("Skin Consultation",    "General dermatology consultation."),
                    ServiceDef("Acne Treatment",       "Medical treatment for acne and breakouts."),
                    ServiceDef("Hair Loss Treatment",  "Diagnosis and treatment for hair thinning."),
                    ServiceDef("PRP Treatment",        "Platelet-rich plasma therapy for skin or hair."),
                ],
            ),
            SubCategoryDef(
                name="Physiotherapy",
                description="Physical therapy and rehabilitation.",
                services=[
                    ServiceDef("Initial Assessment",     "First-time evaluation of condition and history."),
                    ServiceDef("Physio Session",         "Targeted physiotherapy treatment session."),
                    ServiceDef("Sports Injury",          "Rehabilitation for sports-related injuries."),
                    ServiceDef("Post-Surgery Rehab",     "Recovery therapy after surgical procedures."),
                ],
            ),
            SubCategoryDef(
                name="Diagnostics & Lab",
                description="Pathology labs and diagnostic imaging centres.",
                services=[
                    ServiceDef("Blood Test",                "Collection and analysis of blood samples."),
                    ServiceDef("Urine Test",                "Urinalysis for various health markers."),
                    ServiceDef("X-Ray",                     "Radiographic imaging of bones and tissues."),
                    ServiceDef("ECG",                       "Electrocardiogram for heart health."),
                    ServiceDef("Full Body Checkup Package", "Comprehensive panel of tests for overall health."),
                ],
            ),
            SubCategoryDef(
                name="Specialist Consultation",
                description="Consultations with medical specialists.",
                services=[
                    ServiceDef("Cardiology Consultation",   "Heart health assessment by a cardiologist."),
                    ServiceDef("Orthopedic Consultation",   "Bone, joint, and muscle specialist."),
                    ServiceDef("Gynecology Consultation",   "Women's health and reproductive care."),
                    ServiceDef("Pediatric Consultation",    "Child health and development specialist."),
                    ServiceDef("ENT Consultation",          "Ear, nose, and throat specialist."),
                ],
            ),
        ],
    ),

    MainCategoryDef(
        name="Barber & Salon",
        description="Hair salons, barber shops, beauty parlours, and spas.",
        subcategories=[
            SubCategoryDef(
                name="Men's Barber",
                description="Haircuts, shaves, and grooming for men.",
                services=[
                    ServiceDef("Haircut",         "Classic or modern men's haircut."),
                    ServiceDef("Kids Haircut",    "Haircut for children."),
                    ServiceDef("Clean Shave",     "Full clean shave with razor and hot towel."),
                    ServiceDef("Beard Trim",      "Shaping and trimming of beard."),
                    ServiceDef("Beard Styling",   "Creative beard shaping and grooming."),
                    ServiceDef("Head Massage",    "Relaxing scalp and head massage."),
                    ServiceDef("Hair Color (Men)","Hair colouring and highlights for men."),
                    ServiceDef("Facial (Men)",    "Deep cleansing facial for men."),
                    ServiceDef("Hair Wash",       "Shampoo, conditioning, and blow-dry."),
                ],
            ),
            SubCategoryDef(
                name="Ladies Parlour",
                description="Beauty and grooming services for women.",
                services=[
                    ServiceDef("Haircut (Ladies)",        "Women's haircut and styling."),
                    ServiceDef("Hair Color",              "Full hair colouring or highlights."),
                    ServiceDef("Blow Dry & Styling",      "Wash, blow-dry, and style."),
                    ServiceDef("Rebonding / Smoothening", "Permanent hair straightening treatment."),
                    ServiceDef("Threading (Eyebrows)",    "Eyebrow shaping with thread."),
                    ServiceDef("Threading (Full Face)",   "Full face threading including upper lip."),
                    ServiceDef("Waxing (Arms)",           "Hair removal waxing for arms."),
                    ServiceDef("Waxing (Legs)",           "Hair removal waxing for legs."),
                    ServiceDef("Waxing (Full Body)",      "Full body hair removal waxing."),
                    ServiceDef("Facial",                  "Deep cleansing and hydrating facial."),
                    ServiceDef("Cleanup",                 "Basic skin cleanup and brightening."),
                    ServiceDef("Manicure",                "Nail shaping, cuticle care, and polish."),
                    ServiceDef("Pedicure",                "Foot care, nail treatment, and polish."),
                    ServiceDef("Mehendi / Henna",         "Traditional henna design application."),
                    ServiceDef("Bridal Makeup",           "Complete bridal makeup package."),
                ],
            ),
            SubCategoryDef(
                name="Unisex Salon",
                description="Hair and styling services for all genders.",
                services=[
                    ServiceDef("Haircut",            "Haircut for any gender and hair type."),
                    ServiceDef("Hair Color",         "Full colour, highlights, or balayage."),
                    ServiceDef("Hair Treatment",     "Deep conditioning and repair treatment."),
                    ServiceDef("Keratin Treatment",  "Smoothing keratin therapy for frizz-free hair."),
                    ServiceDef("Scalp Treatment",    "Targeted treatment for dandruff or dry scalp."),
                ],
            ),
            SubCategoryDef(
                name="Spa & Wellness",
                description="Relaxation and body wellness treatments.",
                services=[
                    ServiceDef("Swedish Massage",    "Full body relaxation massage."),
                    ServiceDef("Deep Tissue Massage","Targeted massage for muscle tension relief."),
                    ServiceDef("Foot Massage",       "Reflexology and foot relaxation massage."),
                    ServiceDef("Body Scrub",         "Exfoliating full body scrub treatment."),
                    ServiceDef("De-Stress Package",  "Combined massage and relaxation therapy package."),
                ],
            ),
        ],
    ),
]


# ── DB helpers ────────────────────────────────────────────────────────────────

def upsert_category(
    db: Session,
    name: str,
    description: str,
    parent_id: Optional[str] = None,
) -> str:
    """Insert category if it doesn't exist; return its UUID as a string."""
    row = db.execute(
        text("""
            INSERT INTO categories (uuid, name, description, parent_category_id)
            VALUES (gen_random_uuid(), :name, :desc, :parent)
            ON CONFLICT (name) DO NOTHING
            RETURNING uuid
        """),
        {"name": name, "desc": description, "parent": parent_id},
    ).fetchone()

    if row:
        return str(row[0])

    # Already existed — fetch the UUID
    existing = db.execute(
        text("SELECT uuid FROM categories WHERE name = :name"),
        {"name": name},
    ).fetchone()
    return str(existing[0])


def upsert_service(
    db: Session,
    name: str,
    description: str,
    category_id: str,
) -> None:
    """Insert service if it doesn't exist (matched by name)."""
    db.execute(
        text("""
            INSERT INTO services (uuid, name, description, category_id)
            VALUES (gen_random_uuid(), :name, :desc, :cat_id)
            ON CONFLICT (name) DO NOTHING
        """),
        {"name": name, "desc": description, "cat_id": category_id},
    )


# ── Main ─────────────────────────────────────────────────────────────────────

def run(db: Session) -> None:
    cat_count = svc_count = 0

    for main in SEED:
        main_id = upsert_category(db, main.name, main.description)
        cat_count += 1
        log.info("  Main category: %s", main.name)

        for sub in main.subcategories:
            sub_id = upsert_category(db, sub.name, sub.description, parent_id=main_id)
            cat_count += 1
            log.info("    Subcategory:  %s", sub.name)

            for svc in sub.services:
                upsert_service(db, svc.name, svc.description, category_id=sub_id)
                svc_count += 1
                log.info("      Service:    %s", svc.name)

    db.commit()
    log.info("")
    log.info("Done. %d categories/subcategories, %d services seeded.", cat_count, svc_count)


if __name__ == "__main__":
    # Ensure all models are registered so create_all is a no-op (tables already exist)
    from app.models import (  # noqa: F401
        User, UserLogin, Business, Category,
        Address, Schedule, ScheduleBreak, ScheduleException, Employee, Service,
        Queue, QueueUser, QueueService as QueueServiceModel, QueueUserService,
        AppointmentSlot, Role, UserRoles, Review,
    )
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        log.info("Starting seed...")
        run(db)
    except Exception:
        db.rollback()
        log.exception("Seed failed — rolled back.")
        sys.exit(1)
    finally:
        db.close()
