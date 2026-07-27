from app.models.company import Company
from app.models.crm_deal import CRMDeal
from app.models.lead_score import LeadScore
from app.services.crm import sync_service


def test_push_to_csv_writes_latest_scores(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(sync_service.settings, "CRM_SYNC_EXPORT_DIR", str(tmp_path / "export"))

    company = Company(name="Export Co", industry="SaaS", location_country="India")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    db_session.add(
        LeadScore(
            company_id=company.id,
            fit_score=70.0,
            intent_score=80.0,
            conversion_probability=75.0,
            recommended_service="hiring",
            recommendation_confidence=0.8,
            model_version="rules_v1",
        )
    )
    db_session.commit()

    log_entry = sync_service.push_to_csv(db_session)

    assert log_entry.status == "success"
    assert log_entry.record_count == 1

    exported_files = list((tmp_path / "export").glob("*.csv"))
    assert len(exported_files) == 1
    content = exported_files[0].read_text()
    assert "Export Co" in content
    assert "hiring" in content


def test_pull_from_csv_imports_deal_outcomes(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(sync_service.settings, "CRM_SYNC_IMPORT_DIR", str(tmp_path / "import"))

    company = Company(name="Import Co", industry="SaaS")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    import_dir = tmp_path / "import"
    import_dir.mkdir(parents=True)
    csv_path = import_dir / "deals.csv"
    csv_path.write_text(
        "company_id,deal_stage,service_line,deal_value,outcome,closed_at\n"
        f"{company.id},closed_won,hiring,500000,won,2026-07-01T00:00:00+00:00\n"
    )

    log_entry = sync_service.pull_from_csv(db_session)

    assert log_entry.status == "success"
    assert log_entry.record_count == 1
    assert not csv_path.exists()
    assert (import_dir / "deals.csv.processed").exists()

    deals = db_session.query(CRMDeal).all()
    assert len(deals) == 1
    assert deals[0].outcome == "won"
    assert deals[0].service_line == "hiring"


def test_pull_from_csv_reports_row_errors_as_partial(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(sync_service.settings, "CRM_SYNC_IMPORT_DIR", str(tmp_path / "import"))

    import_dir = tmp_path / "import"
    import_dir.mkdir(parents=True)
    (import_dir / "bad.csv").write_text(
        "company_id,deal_stage,service_line,deal_value,outcome,closed_at\n,closed_won,hiring,,won,\n"
    )

    log_entry = sync_service.pull_from_csv(db_session)

    assert log_entry.status == "partial"
    assert log_entry.record_count == 0
    assert "missing company_id" in log_entry.error_detail
