#!/usr/bin/env python3
"""
src/report.py - Transaction Volume Forecasting Report Generator

Generates summary reports (text and CSV) for daily forecasts, weekly projections,
and historical error metrics using ARIMA time series modeling.

Dependencies:
    - pandas, numpy, statsmodels, matplotlib

Usage:
    >>> from src.report import TransactionVolumeForecaster
    >>> forecaster = TransactionVolumeForecaster()
    >>> forecaster.ingest_data('volumes.csv')
    >>> forecaster.fit()
    >>> forecaster.backtest()
    >>> forecaster.forecast_daily(30)
    >>> forecaster.forecast_weekly(4)
    >>> forecaster.generate_report(output_dir='./reports')
"""

import csv
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA, ARIMAResults

matplotlib.use("Agg")  # Non-interactive backend for server environments

logger = logging.getLogger(__name__)


class TransactionVolumeForecaster:
    """
    A modular pipeline for daily/weekly transaction volume forecasting and reporting.

    Attributes:
        historical_series: Input time series with DatetimeIndex.
        fitted_model: Trained ARIMA results object.
        daily_forecast: Forecasted daily values (optional).
        weekly_projection: Forecasted weekly aggregated values (optional).
        error_metrics: Historical error metrics (MAE, RMSE, MAPE).
        order: ARIMA order (p,d,q).
    """

    def __init__(
        self,
        order: Optional[Tuple[int, int, int]] = None,
        forecast_days: int = 30,
        forecast_weeks: int = 4,
        test_split: float = 0.2,
    ) -> None:
        """
        Initialize the forecaster.

        Args:
            order: ARIMA order (p,d,q). If None, defaults to (1,1,1).
            forecast_days: Default number of days for daily forecasts (>=1).
            forecast_weeks: Default number of weeks for weekly projections (>=1).
            test_split: Fraction of data to hold out for backtesting (0 < split < 1).

        Raises:
            ValueError: If forecast_days <= 0, forecast_weeks <= 0,
                        or test_split not in (0,1).
        """
        if forecast_days < 1:
            raise ValueError("forecast_days must be >= 1")
        if forecast_weeks < 1:
            raise ValueError("forecast_weeks must be >= 1")
        if not 0 < test_split < 1:
            raise ValueError("test_split must be between 0 and 1")

        self.order = order or (1, 1, 1)
        self._forecast_days = forecast_days
        self._forecast_weeks = forecast_weeks
        self._test_split = test_split

        # Data
        self.historical_series: Optional[pd.Series] = None
        self.fitted_model: Optional[ARIMAResults] = None

        # Results
        self.daily_forecast: Optional[pd.Series] = None
        self.weekly_projection: Optional[pd.Series] = None
        self.error_metrics: Dict[str, float] = {}
        self._historical_comparison: Optional[pd.DataFrame] = None

        # Internal state
        self._fitted_order: Optional[Tuple[int, int, int]] = None

    # ------------------------------------------------------------------
    # Data ingestion
    # ------------------------------------------------------------------
    def ingest_data(
        self,
        data_source: Union[str, Path, pd.Series, pd.DataFrame],
        date_column: str = "date",
        value_column: str = "volume",
        freq: str = "D",
    ) -> None:
        """
        Ingest historical transaction volume data.

        Args:
            data_source: Path to CSV file or pandas Series/DataFrame.
            date_column: Column name for dates (if DataFrame).
            value_column: Column name for transaction volumes (if DataFrame).
            freq: Frequency of the series (default daily 'D').

        Raises:
            FileNotFoundError: If CSV path does not exist.
            TypeError: If data_source type is unsupported.
            ValueError: If data is empty or index invalid.
        """
        logger.debug("Ingesting data from type: %s", type(data_source).__name__)

        try:
            if isinstance(data_source, (str, Path)):
                path = Path(data_source)
                if not path.exists():
                    raise FileNotFoundError(f"Data file not found: {path}")
                df = pd.read_csv(path, parse_dates=[date_column])
                if df.empty:
                    raise ValueError("CSV file is empty")
                series = df.set_index(date_column)[value_column].sort_index()
            elif isinstance(data_source, pd.Series):
                series = data_source.copy().sort_index()
            elif isinstance(data_source, pd.DataFrame):
                if data_source.empty:
                    raise ValueError("DataFrame is empty")
                series = data_source.set_index(date_column)[value_column].sort_index()
            else:
                raise TypeError(
                    "data_source must be a file path, pandas Series, or DataFrame."
                )

            # Validate index type
            if not isinstance(series.index, pd.DatetimeIndex):
                raise ValueError("Index must be a DatetimeIndex after parsing.")

            # Ensure uniform frequency and handle missing values
            series = series.asfreq(freq)
            null_count = series.isnull().sum()
            if null_count > 0:
                logger.warning(
                    "Missing values detected after resampling; forward-filling %d gaps.",
                    null_count,
                )
                series = series.fillna(method="ffill")

            if series.empty:
                raise ValueError("Ingested series is empty after processing.")

            self.historical_series = series
            logger.info(
                "Ingested %d data points from %s to %s (freq=%s)",
                len(series),
                series.index[0].strftime("%Y-%m-%d"),
                series.index[-1].strftime("%Y-%m-%d"),
                freq,
            )

        except (FileNotFoundError, TypeError, ValueError) as exc:
            logger.error("Data ingestion failed: %s", exc)
            raise

    # ------------------------------------------------------------------
    # Model fitting
    # ------------------------------------------------------------------
    def fit(self, order: Optional[Tuple[int, int, int]] = None) -> None:
        """
        Fit the ARIMA model to the historical series.

        Args:
            order: Override for model order. Uses default or previously set.

        Raises:
            RuntimeError: If no data has been ingested.
            ValueError: If series is too short for the given order.
        """
        if self.historical_series is None:
            raise RuntimeError("No data ingested. Call ingest_data() first.")

        order = order if order is not None else self.order
        # Validate order complexity against series length
        p, d, q = order
        if len(self.historical_series) <= max(p + q, d):
            raise ValueError(
                f"Series length ({len(self.historical_series)}) is too short "
                f"for ARIMA order {order}."
            )

        logger.info(
            "Fitting ARIMA%s to %d samples",
            order,
            len(self.historical_series),
        )
        try:
            model = ARIMA(self.historical_series, order=order)
            self.fitted_model = model.fit()
            self._fitted_order = order
            logger.info(
                "Model fitted successfully. AIC=%.2f, BIC=%.2f",
                self.fitted_model.aic,
                self.fitted_model.bic,
            )
        except Exception as exc:
            logger.exception("ARIMA fitting failed.")
            raise RuntimeError("Model fitting failed.") from exc

    # ------------------------------------------------------------------
    # Backtesting and error metrics
    # ------------------------------------------------------------------
    def backtest(self, test_size: Optional[int] = None) -> Dict[str, float]:
        """
        Backtest the model on a holdout set and compute error metrics.

        Args:
            test_size: Number of samples to hold out. If None, uses
                       self._test_split fraction.

        Returns:
            Dictionary with keys 'mae', 'rmse', 'mape'.

        Raises:
            RuntimeError: If model not fitted.
            ValueError: If test_size is larger than available data.
        """
        if self.fitted_model is None:
            raise RuntimeError("Model not fitted. Call fit() first.")
        if self.historical_series is None:
            raise RuntimeError("No historical series available.")

        n = len(self.historical_series)
        if test_size is None:
            test_size = max(1, int(n * self._test_split))

        if test_size >= n:
            raise ValueError(
                f"test_size ({test_size}) must be less than series length ({n})."
            )

        train = self.historical_series.iloc[:-test_size]
        test = self.historical_series.iloc[-test_size:]

        try:
            model = ARIMA(train, order=self._fitted_order)
            model_fit = model.fit()
        except Exception as exc:
            logger.exception("Backtest model fitting failed.")
            raise RuntimeError("Backtest failed during model fit.") from exc

        try:
            forecast = model_fit.forecast(steps=test_size)
        except Exception as exc:
            logger.exception("Backtest forecasting failed.")
            raise RuntimeError("Backtest failed during forecasting.") from exc

        # Align indices
        forecast.index = test.index
        actual = test.values
        predicted = forecast.values

        # Filter out NaN/Inf
        valid_mask = np.isfinite(actual) & np.isfinite(predicted)
        actual_clean = actual[valid_mask]
        predicted_clean = predicted[valid_mask]

        if len(actual_clean) == 0:
            raise RuntimeError("No valid data points for metric calculation.")

        errors = actual_clean - predicted_clean
        mae = float(np.mean(np.abs(errors)))
        rmse = float(np.sqrt(np.mean(errors ** 2)))
        # MAPE avoids division by zero
        non_zero = actual_clean != 0
        if np.any(non_zero):
            mape = float(np.mean(np.abs(errors[non_zero] / actual_clean[non_zero])))
        else:
            mape = float("inf")
            logger.warning("All actual values are zero; MAPE is undefined.")

        self.error_metrics = {"mae": mae, "rmse": rmse, "mape": mape}
        logger.info(
            "Backtest results: MAE=%.4f, RMSE=%.4f, MAPE=%.4f%%",
            mae,
            rmse,
            mape * 100,
        )
        return self.error_metrics

    # ------------------------------------------------------------------
    # Daily forecast
    # ------------------------------------------------------------------
    def forecast_daily(self, steps: Optional[int] = None) -> pd.Series:
        """
        Generate daily forecast for the given number of steps.

        Args:
            steps: Number of days to forecast. If None, uses default
                   self._forecast_days (set at init).

        Returns:
            Pandas Series with DatetimeIndex and forecast values.

        Raises:
            RuntimeError: If model not fitted.
            ValueError: If steps <= 0.
        """
        if self.fitted_model is None:
            raise RuntimeError("Model not fitted. Call fit() first.")

        if steps is None:
            steps = self._forecast_days
        elif steps < 1:
            raise ValueError("steps must be >= 1.")

        logger.info("Forecasting %d days ahead.", steps)
        try:
            pred = self.fitted_model.forecast(steps=steps)
            # If the series has a frequency we can build a proper index
            last_date = self.historical_series.index[-1]  # type: ignore[union-attr]
            date_range = pd.date_range(
                start=last_date + timedelta(days=1), periods=steps, freq="D"
            )
            pred.index = date_range
            self.daily_forecast = pred
        except Exception as exc:
            logger.exception("Daily forecasting failed.")
            raise RuntimeError("Daily forecasting error.") from exc

        return self.daily_forecast

    # ------------------------------------------------------------------
    # Weekly projection
    # ------------------------------------------------------------------
    def forecast_weekly(self, weeks: Optional[int] = None) -> pd.Series:
        """
        Generate weekly aggregated projection.

        Aggregates by sum of daily forecasts over 7-day periods.

        Args:
            weeks: Number of weeks to project. If None, uses default
                   self._forecast_weeks (set at init).

        Returns:
            Pandas Series with week-start index and projected volumes.

        Raises:
            RuntimeError: If daily forecast not generated.
            ValueError: If weeks <= 0.
        """
        if weeks is None:
            weeks = self._forecast_weeks
        elif weeks < 1:
            raise ValueError("weeks must be >= 1.")

        # First ensure we have daily forecast for the needed period
        needed_days = weeks * 7
        if self.daily_forecast is None or len(self.daily_forecast) < needed_days:
            logger.info(
                "Generating daily forecast for %d days to support weekly projection.",
                needed_days,
            )
            self.forecast_daily(steps=needed_days)

        if self.daily_forecast is None:
            raise RuntimeError("Daily forecast could not be generated.")

        days_to_use = self.daily_forecast.iloc[:needed_days]
        # Resample to weekly sums
        weekly = days_to_use.resample("W-MON").sum()
        # Ensure we have exactly 'weeks' entries
        if len(weekly) > weeks:
            weekly = weekly.iloc[:weeks]
        elif len(weekly) < weeks:
            logger.warning(
                "Only %d full weeks available from %d days.", len(weekly), needed_days
            )

        self.weekly_projection = weekly
        logger.info("Weekly projection generated for %d weeks.", len(weekly))
        return self.weekly_projection

    # ------------------------------------------------------------------
    # Historical comparisons
    # ------------------------------------------------------------------
    def compute_historical_comparison(
        self, compare_periods: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Compare forecasted value to actual historical values for the
        same period length (last N days).

        Args:
            compare_periods: Number of days to compare. If None,
                             uses the length of daily_forecast.

        Returns:
            DataFrame with 'actual', 'forecast', and 'error' columns.

        Raises:
            RuntimeError: If daily forecast not generated or no history.
        """
        if self.daily_forecast is None:
            raise RuntimeError("Daily forecast not generated. Call forecast_daily() first.")
        if self.historical_series is None:
            raise RuntimeError("No historical data available.")

        n_forecast = len(self.daily_forecast)
        if compare_periods is None:
            compare_periods = n_forecast
        else:
            compare_periods = min(compare_periods, n_forecast)

        if compare_periods > len(self.historical_series):
            compare_periods = len(self.historical_series)
            logger.warning(
                "compare_periods reduced to series length (%d).", compare_periods
            )

        # Get the most recent 'compare_periods' days from history
        actual_slice = self.historical_series.iloc[-compare_periods:].copy()
        forecast_slice = self.daily_forecast.iloc[:len(actual_slice)]

        # Align by making a common index (use actual dates)
        combined = pd.DataFrame({"actual": actual_slice, "forecast": forecast_slice})
        combined["error"] = combined["actual"] - combined["forecast"]
        combined["abs_error"] = combined["error"].abs()

        self._historical_comparison = combined
        logger.info(
            "Historical comparison computed for %d periods.",
            len(combined),
        )
        return self._historical_comparison

    # ------------------------------------------------------------------
    # Report generation
    # ------------------------------------------------------------------
    def generate_report(
        self,
        output_dir: Union[str, Path] = "./reports",
        include_plot: bool = True,
    ) -> Dict[str, str]:
        """
        Generate text summary and CSV report files.

        Args:
            output_dir: Directory for output files. Created if not exists.
            include_plot: If True, generate a comparison plot PNG.

        Returns:
            Dictionary mapping report type to file path.

        Raises:
            RuntimeError: If required forecasts are missing.
            OSError: If directory creation or file writing fails.
        """
        # Ensure required data exists
        if self.daily_forecast is None:
            raise RuntimeError("Daily forecast missing. Call forecast_daily() first.")
        if self.weekly_projection is None:
            raise RuntimeError("Weekly projection missing. Call forecast_weekly() first.")

        output_path = Path(output_dir)
        try:
            output_path.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            logger.error("Cannot create output directory %s: %s", output_path, exc)
            raise

        base_name = f"forecast_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        report_files: Dict[str, str] = {}

        # ----- Text report -----
        txt_path = output_path / f"{base_name}_report.txt"
        try:
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write("=" * 60 + "\n")
                f.write("TRANSACTION VOLUME FORECAST REPORT\n")
                f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("=" * 60 + "\n\n")

                f.write("--- Model Information ---\n")
                f.write(f"ARIMA Order: {self._fitted_order}\n")
                if self.historical_series is not None:
                    f.write(f"Historical Data Range: {self.historical_series.index[0].date()} to "
                            f"{self.historical_series.index[-1].date()}\n")
                    f.write(f"Number of Data Points: {len(self.historical_series)}\n")
                f.write("\n")

                if self.error_metrics:
                    f.write("--- Backtest Error Metrics ---\n")
                    f.write(f"MAE : {self.error_metrics['mae']:.4f}\n")
                    f.write(f"RMSE: {self.error_metrics['rmse']:.4f}\n")
                    f.write(f"MAPE: {self.error_metrics['mape']*100:.2f}%\n\n")

                f.write("--- Daily Forecast (first 5 entries) ---\n")
                f.write(self.daily_forecast.head().to_string() + "\n\n")

                f.write("--- Weekly Projection ---\n")
                f.write(self.weekly_projection.to_string() + "\n\n")

                if self._historical_comparison is not None:
                    f.write("--- Historical Comparison (last 5 entries) ---\n")
                    f.write(self._historical_comparison.tail().to_string() + "\n")
            report_files["txt"] = str(txt_path)
            logger.info("Text report saved to %s", txt_path)
        except OSError as exc:
            logger.error("Failed to write text report: %s", exc)
            raise

        # ----- CSV report -----
        csv_path = output_path / f"{base_name}_forecast.csv"
        try:
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["Date", "Daily_Forecast", "Weekly_Projection"])

                # Write daily forecast and weekly projection aligned by week start
                daily_dict = self.daily_forecast.to_dict()
                weekly_dict = self.weekly_projection.to_dict()
                all_dates = sorted(set(list(daily_dict.keys()) + list(weekly_dict.keys())))
                for dt in all_dates:
                    day_val = daily_dict.get(dt, "")
                    week_val = weekly_dict.get(dt, "")
                    writer.writerow([dt.date(), day_val, week_val])

            report_files["csv"] = str(csv_path)
            logger.info("CSV report saved to %s", csv_path)
        except OSError as exc:
            logger.error("Failed to write CSV report: %s", exc)
            raise

        # ----- Plot (optional) -----
        if include_plot and self._historical_comparison is not None:
            plot_path = output_path / f"{base_name}_comparison.png"
            try:
                self._plot_comparison(plot_path)
                report_files["plot"] = str(plot_path)
            except Exception as exc:
                logger.warning("Plot generation failed: %s", exc)
                # Non-fatal: continue

        return report_files

    # ------------------------------------------------------------------
    # Private helper for plotting
    # ------------------------------------------------------------------
    def _plot_comparison(self, save_path: Path) -> None:
        """
        Generate a comparison plot of actual vs forecast.

        Args:
            save_path: Path to save the PNG file.
        """
        if self._historical_comparison is None:
            raise RuntimeError("No comparison data to plot.")

        fig, ax = plt.subplots(figsize=(12, 5))
        ax.plot(
            self._historical_comparison.index,
            self._historical_comparison["actual"],
            label="Actual",
            color="navy",
            linewidth=1.5,
        )
        ax.plot(
            self._historical_comparison.index,
            self._historical_comparison["forecast"],
            label="Forecast",
            color="firebrick",
            linestyle="--",
            linewidth=1.5,
        )
        ax.fill_between(
            self._historical_comparison.index,
            self._historical_comparison["actual"],
            self._historical_comparison["forecast"],
            alpha=0.2,
            color="gray",
            label="Error",
        )
        ax.set_title("Transaction Volume: Actual vs Forecast (Historical Comparison)")
        ax.set_xlabel("Date")
        ax.set_ylabel("Volume")
        ax.legend()
        ax.grid(True, alpha=0.3)
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(save_path, dpi=150)
        plt.close(fig)
        logger.info("Comparison plot saved to %s", save_path)

    # ------------------------------------------------------------------
    # String representation
    # ------------------------------------------------------------------
    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"order={self._fitted_order}, "
            f"n_historical={len(self.historical_series) if self.historical_series is not None else 0}, "
            f"daily_forecast={'ready' if self.daily_forecast is not None else 'not generated'})"
        )


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    # Create sample data for demonstration
    dates = pd.date_range(start="2023-01-01", periods=100, freq="D")
    volumes = 100 + 10 * np.sin(np.linspace(0, 4 * np.pi, 100)) + np.random.normal(0, 5, 100)
    data = pd.Series(volumes, index=dates, name="volume")

    forecaster = TransactionVolumeForecaster(order=(1, 1, 1))
    forecaster.ingest_data(data)
    forecaster.fit()
    forecaster.backtest()
    forecaster.forecast_daily(14)
    forecaster.forecast_weekly(2)
    forecaster.compute_historical_comparison()
    reports = forecaster.generate_report(include_plot=True)
    print("Generated reports:", reports)