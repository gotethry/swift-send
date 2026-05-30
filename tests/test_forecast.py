"""
Unit tests for transaction volume forecasting.

Tests cover data loading, ARIMA model fitting, daily/weekly forecast generation,
and historical comparisons.
"""
import io
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest
from statsmodels.tsa.arima.model import ARIMA


# ---------------------------------------------------------------------------
# Helper functions that would normally reside in the production package.
# Included here to make the test suite self-contained.
# ---------------------------------------------------------------------------

def load_data(csv_string: str) -> pd.DataFrame:
    """Load transaction volume data from CSV string (simulates file loading)."""
    df = pd.read_csv(io.StringIO(csv_string), parse_dates=["date"])
    df = df.set_index("date").asfreq("D")  # ensure daily frequency
    return df


def fit_arima(series: pd.Series, order: tuple = (1, 1, 1)) -> ARIMA:
    """Fit ARIMA model to a daily time series."""
    model = ARIMA(series, order=order)
    return model.fit()


def generate_forecast(
    fitted_model: ARIMA, steps: int
) -> pd.DataFrame:
    """Generate forecast with confidence intervals."""
    forecast_result = fitted_model.get_forecast(steps=steps)
    pred_df = forecast_result.summary_frame(alpha=0.05)
    pred_df.columns = ["forecast", "std_err", "ci_lower", "ci_upper"]
    return pred_df


def aggregate_weekly(series: pd.Series) -> pd.Series:
    """Aggregate daily series to weekly sums."""
    return series.resample("W-MON").sum()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_data() -> pd.DataFrame:
    """Generate 60 days of synthetic transaction volumes."""
    rng = np.random.default_rng(42)
    dates = pd.date_range("2024-01-01", periods=60, freq="D")
    trend = np.linspace(1000, 1300, 60)
    seasonality = 50 * np.sin(2 * np.pi * np.arange(60) / 7)
    noise = rng.normal(0, 20, 60)
    volumes = trend + seasonality + noise
    csv = "\n".join(
        ["date,volume"]
        + [f"{d.strftime('%Y-%m-%d')},{v:.2f}" for d, v in zip(dates, volumes)]
    )
    return load_data(csv)


@pytest.fixture
def fitted_arima(sample_data: pd.DataFrame) -> ARIMA:
    """Fit an ARIMA model to the sample data (test fixture)."""
    series = sample_data["volume"]
    return fit_arima(series, order=(1, 1, 1))


# ---------------------------------------------------------------------------
# Tests for data loading
# ---------------------------------------------------------------------------

class TestDataLoading:
    def test_load_data_returns_dataframe(self):
        csv = "date,volume\n2024-01-01,100\n2024-01-02,110\n"
        result = load_data(csv)
        assert isinstance(result, pd.DataFrame)

    def test_load_data_sets_daily_frequency(self):
        csv = "date,volume\n2024-01-01,100\n2024-01-02,110\n"
        result = load_data(csv)
        assert result.index.freqstr == "D"

    def test_load_data_missing_dates(self):
        """Missing dates should be introduced and filled with NaN."""
        csv = "date,volume\n2024-01-01,100\n2024-01-03,120\n"
        result = load_data(csv)
        expected_index = pd.date_range("2024-01-01", periods=3, freq="D")
        pd.testing.assert_index_equal(result.index, expected_index)
        assert result.loc["2024-01-02"].isna()["volume"]

    def test_load_data_empty_raises(self):
        with pytest.raises(pd.errors.EmptyDataError):
            load_data("date,volume\n")


# ---------------------------------------------------------------------------
# Tests for model fitting
# ---------------------------------------------------------------------------

class TestModelFitting:
    def test_fit_arima_returns_fitted_model(self, sample_data: pd.DataFrame):
        series = sample_data["volume"]
        model = fit_arima(series, order=(2, 1, 1))
        assert hasattr(model, "params")
        assert len(model.params) > 0

    def test_fit_arima_with_default_order(self, sample_data: pd.DataFrame):
        series = sample_data["volume"]
        model = fit_arima(series)
        assert "ar.L1" in model.params.index
        assert "ma.L1" in model.params.index

    def test_fit_arima_raises_on_too_short_series(self):
        short_series = pd.Series(
            [100.0, 110.0],
            index=pd.date_range("2024-01-01", periods=2, freq="D"),
        )
        with pytest.raises(ValueError):
            fit_arima(short_series, order=(1, 1, 1))


# ---------------------------------------------------------------------------
# Tests for forecast generation
# ---------------------------------------------------------------------------

class TestForecastGeneration:
    def test_generate_forecast_returns_dataframe(self, fitted_arima: ARIMA):
        forecast = generate_forecast(fitted_arima, steps=7)
        assert isinstance(forecast, pd.DataFrame)

    def test_forecast_columns(self, fitted_arima: ARIMA):
        forecast = generate_forecast(fitted_arima, steps=7)
        expected = ["forecast", "std_err", "ci_lower", "ci_upper"]
        assert list(forecast.columns) == expected

    def test_forecast_length(self, fitted_arima: ARIMA):
        assert len(generate_forecast(fitted_arima, steps=14)) == 14

    def test_daily_forecast_values(self, fitted_arima: ARIMA):
        """Forecast values should be finite and realistic."""
        forecast = generate_forecast(fitted_arima, steps=10)
        assert np.all(np.isfinite(forecast["forecast"]))
        assert forecast["forecast"].between(800, 2000).all()

    def test_confidence_intervals_ordered(self, fitted_arima: ARIMA):
        """Lower CI should be <= forecast <= upper CI."""
        forecast = generate_forecast(fitted_arima, steps=7)
        assert (forecast["ci_lower"] <= forecast["forecast"]).all()
        assert (forecast["forecast"] <= forecast["ci_upper"]).all()


# ---------------------------------------------------------------------------
# Tests for weekly projections
# ---------------------------------------------------------------------------

class TestWeeklyProjections:
    def test_aggregate_weekly_returns_weekly_frequency(self, sample_data: pd.DataFrame):
        weekly = aggregate_weekly(sample_data["volume"])
        assert weekly.index.freqstr == "W-MON"

    def test_aggregate_weekly_cumulative_values(self, sample_data: pd.DataFrame):
        weekly = aggregate_weekly(sample_data["volume"])
        total_daily = sample_data["volume"].sum()
        total_weekly = weekly.sum()
        assert abs(total_daily - total_weekly) < 1e-6

    def test_weekly_forecast(self, fitted_arima: ARIMA):
        """Generate daily forecast for 14 days, then aggregate to weekly."""
        daily_forecast = generate_forecast(fitted_arima, steps=14)
        forecast_series = daily_forecast["forecast"].copy()
        forecast_series.index = pd.date_range(
            start=pd.Timestamp.today().date(), periods=14, freq="D"
        )
        weekly_forecast = aggregate_weekly(forecast_series)
        assert len(weekly_forecast) == 2  # two full weeks
        assert (weekly_forecast > 0).all()


# ---------------------------------------------------------------------------
# Tests for historical comparisons
# ---------------------------------------------------------------------------

class TestHistoricalComparisons:
    def test_historical_mean(self, sample_data: pd.DataFrame):
        """Check that historical mean is computed correctly."""
        hist_mean = sample_data["volume"].mean()
        assert isinstance(hist_mean, float)
        assert 1000 <= hist_mean <= 1300  # within synthetic range

    def test_forecast_vs_historical_trend(self, fitted_arima: ARIMA, sample_data: pd.DataFrame):
        """Forecast values should not deviate wildly from recent history."""
        forecast = generate_forecast(fitted_arima, steps=7)
        hist_mean = sample_data["volume"].iloc[-30:].mean()
        fc_mean = forecast["forecast"].mean()
        # Allow up to 30% difference
        assert abs(fc_mean - hist_mean) / hist_mean < 0.3

    def test_historical_comparison_structure(self, sample_data: pd.DataFrame):
        """Simulate a comparison table covering actual vs forecasted period."""
        # Imagine we have a past forecast for the last 7 days and actuals
        actuals = sample_data["volume"].iloc[-7:]
        forecast = generate_forecast(
            fit_arima(sample_data["volume"].iloc[:-7], order=(1, 1, 1)), steps=7
        )
        comparison = pd.DataFrame(
            {"actual": actuals.values, "forecast": forecast["forecast"].values},
            index=actuals.index,
        )
        comparison["error"] = comparison["actual"] - comparison["forecast"]
        assert "actual" in comparison.columns
        assert "forecast" in comparison.columns
        assert "error" in comparison.columns
        # Errors should be moderate for this synthetic data
        assert comparison["error"].abs().mean() < 150


# ---------------------------------------------------------------------------
# Edge cases and robustness tests
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_forecast_with_nan_in_series(self):
        """Model should handle data with one NaN by filling or raising gracefully."""
        dates = pd.date_range("2024-01-01", periods=10, freq="D")
        vals = [100.0, 110.0, np.nan, 130.0, 140.0, 150.0, 160.0, 170.0, 180.0, 190.0]
        series = pd.Series(vals, index=dates)
        # The current fit_arima doesn't handle NaN – we expect it to fail.
        # Real production code would drop or interpolate.
        with pytest.raises(ValueError):
            fit_arima(series, order=(1, 1, 1))

    def test_forecast_negative_steps(self, fitted_arima: ARIMA):
        with pytest.raises(ValueError, match="steps"):
            generate_forecast(fitted_arima, steps=-1)

    def test_forecast_zero_steps(self, fitted_arima: ARIMA):
        forecast = generate_forecast(fitted_arima, steps=0)
        assert len(forecast) == 0