"""
src/data_loader.py

Production-grade module for loading transaction volume time series data and
performing ARIMA/SARIMA-based forecasting (daily/weekly projections and
historical comparisons).

Typical usage:
    from src.data_loader import load_data, TransactionForecaster

    data = load_data(source='sample')
    forecaster = TransactionForecaster(data['volume'])
    forecaster.fit(order=(1,1,1), seasonal_order=(1,1,1,7))
    daily_forecast = forecaster.forecast_daily(steps=30)
    weekly_projection = forecaster.forecast_weekly(weeks=4)
    comparison = forecaster.get_historical_comparison(steps=10)
    forecaster.plot_historical_comparison(steps=10)
"""

from __future__ import annotations

import datetime
import logging
import os
import warnings
from typing import Any, Dict, List, Optional, Tuple, Union

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf  # noqa: F401
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tools.sm_exceptions import ConvergenceWarning

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------------------
_VALID_FREQS = {"D", "W", "M", "H", "T", "S", "B", "H", "Q", "Y"}
_DEFAULT_PERIODS = 730
_DEFAULT_FREQ = "D"
_PLOT_FIGSIZE = (12, 6)
_FORECAST_ALPHA = 0.05  # 95% confidence interval

# ------------------------------------------------------------------------------
# Custom Exception
# ------------------------------------------------------------------------------


class ForecastingError(Exception):
    """Raised when a forecasting operation fails."""


# ------------------------------------------------------------------------------
# Data Loading
# ------------------------------------------------------------------------------


def generate_sample_data(
    start: str = "2020-01-01",
    periods: int = _DEFAULT_PERIODS,
    freq: str = _DEFAULT_FREQ,
    trend: float = 0.5,
    seasonal_amplitude: float = 200.0,
    noise_std: float = 50.0,
    random_seed: int = 42,
) -> pd.DataFrame:
    """
    Generate a realistic transaction volume time series for demonstration.

    The series contains a linear trend, yearly seasonality, and Gaussian noise.

    Parameters
    ----------
    start : str, default "2020-01-01"
        Start date for the time index.
    periods : int, default 730
        Number of daily observations (2 years).
    freq : str, default "D"
        Pandas frequency string (e.g., 'D', 'W', 'M').
    trend : float, default 0.5
        Slope of the linear trend (volume increase per day).
    seasonal_amplitude : float, default 200.0
        Amplitude of the yearly sinusoidal pattern.
    noise_std : float, default 50.0
        Standard deviation of additive Gaussian noise.
    random_seed : int, default 42
        Seed for reproducibility.

    Returns
    -------
    pd.DataFrame
        Columns: ['volume'], index: DatetimeIndex.

    Raises
    ------
    ValueError
        If `periods` is not positive or `freq` is invalid.
    """
    if not isinstance(periods, int) or periods <= 0:
        raise ValueError("`periods` must be a positive integer.")
    if freq not in _VALID_FREQS:
        logger.warning(
            "Unusual frequency '%s' – proceeding but results may be unexpected.",
            freq,
        )

    rng: np.random.Generator = np.random.default_rng(random_seed)
    date_range = pd.date_range(start=start, periods=periods, freq=freq)
    t = np.arange(periods, dtype=np.float64)
    # Linear trend + yearly seasonality (365 days)
    base = trend * t + seasonal_amplitude * np.sin(2 * np.pi * t / 365)
    noise = rng.normal(0, noise_std, size=periods)
    volume = base + noise
    volume = np.maximum(volume, 0.0)  # ensure non‑negative

    logger.info(
        "Generated %d observations from %s to %s.",
        periods,
        date_range[0],
        date_range[-1],
    )
    return pd.DataFrame({"volume": volume}, index=date_range)


def load_data(
    source: str = "sample",
    filepath: Optional[str] = None,
    **kwargs: Any,
) -> pd.DataFrame:
    """
    Load transaction volume time series from CSV, API stub, or sample data.

    Parameters
    ----------
    source : str, default "sample"
        One of ``"sample"``, ``"csv"``, or ``"api"``.
        - ``"sample"`` uses :func:`generate_sample_data`.
        - ``"csv"`` reads from `filepath` (must be provided).
        - ``"api"`` is a stub that currently falls back to sample data.
    filepath : str, optional
        Path to a CSV file with columns ``'ds'`` (datetime) and ``'volume'``.
        Required when ``source="csv"``.
    **kwargs
        Additional arguments passed to :func:`generate_sample_data` (only for
        ``source="sample"``).

    Returns
    -------
    pd.DataFrame
        Time series sorted by ascending index.
        Columns: ['volume'], index: DatetimeIndex.

    Raises
    ------
    FileNotFoundError
        If ``source="csv"`` and `filepath` does not exist.
    ValueError
        If CSV is missing required columns, or if `source` is unknown.
    SecurityError
        If filepath contains directory traversal patterns (when source='csv').
    """
    if source not in {"sample", "csv", "api"}:
        raise ValueError(
            f"Unknown source: '{source}'. Choose from 'sample', 'csv', or 'api'."
        )

    if source == "sample":
        logger.info("Generating sample transaction volume data.")
        df = generate_sample_data(**kwargs)
    elif source == "csv":
        if filepath is None:
            raise ValueError("`filepath` must be provided when source='csv'.")
        # Security: basic path validation to avoid directory traversal
        normalized_path = os.path.normpath(filepath)
        if not normalized_path.startswith(os.getcwd()) and ".." in filepath:
            raise ValueError("Invalid filepath: directory traversal detected.")
        if not os.path.isfile(normalized_path):
            raise FileNotFoundError(f"CSV file not found: {normalized_path}")
        logger.info("Loading transaction volume from CSV: %s", normalized_path)
        try:
            df = pd.read_csv(normalized_path, parse_dates=["ds"], index_col="ds")
        except Exception as exc:
            raise ValueError(
                f"Failed to parse CSV: {normalized_path}"
            ) from exc
        if "volume" not in df.columns:
            raise ValueError("CSV must contain a 'volume' column.")
        df = df[["volume"]]
    else:  # source == "api"
        logger.warning("API source is stubbed; falling back to sample data.")
        df = generate_sample_data(**kwargs)

    # Ensure sorted datetime index with appropriate frequency
    df.sort_index(inplace=True)
    df.index = pd.DatetimeIndex(df.index)
    inferred_freq = pd.infer_freq(df.index)
    if inferred_freq:
        df.index.freq = inferred_freq
    else:
        logger.warning("Could not infer frequency from the loaded data.")

    logger.info(
        "Loaded %d observations from %s to %s. Frequency: %s",
        len(df),
        df.index.min(),
        df.index.max(),
        df.index.freq,
    )
    return df


# ------------------------------------------------------------------------------
# Validation helper
# ------------------------------------------------------------------------------


def _validate_series(series: pd.Series) -> None:
    """
    Validate that `series` is suitable for forecasting.

    Parameters
    ----------
    series : pd.Series
        Input time series.

    Raises
    ------
    TypeError
        If index is not DatetimeIndex.
    ValueError
        If series is empty or contains non-numeric values or NaN.
    """
    if not isinstance(series.index, pd.DatetimeIndex):
        raise TypeError("Series must have a DatetimeIndex.")
    if len(series) == 0:
        raise ValueError("Series is empty.")
    if not np.issubdtype(series.dtype, np.number):
        raise ValueError("Series values must be numeric.")
    if series.isnull().any():
        raise ValueError("Series contains NaN values.")


# ------------------------------------------------------------------------------
# Forecasting Engine
# ------------------------------------------------------------------------------


class TransactionForecaster:
    """
    Fit SARIMA models to transaction volume time series and generate forecasts.

    Supports daily and weekly projections, historical comparisons, and
    visualisation of forecasts against actual data.

    Parameters
    ----------
    series : pd.Series
        Time series with a DatetimeIndex and numeric values.
    """

    def __init__(self, series: pd.Series) -> None:
        _validate_series(series)
        self._series: pd.Series = series.copy()
        self._model: Optional[Union[ARIMA, SARIMAX]] = None
        self._results: Optional[Any] = None  # Holds fitted model results
        self._freq: str = pd.infer_freq(series.index) or "D"
        logger.info(
            "TransactionForecaster initialized with %d observations (freq=%s).",
            len(series),
            self._freq,
        )

    # --------------------------------------------------------------------------
    # Model Fitting
    # --------------------------------------------------------------------------

    def fit(
        self,
        order: Tuple[int, int, int] = (1, 1, 1),
        seasonal_order: Optional[Tuple[int, int, int, int]] = None,
        **kwargs: Any,
    ) -> None:
        """
        Fit a SARIMA model to the time series.

        Parameters
        ----------
        order : tuple of (p,d,q), default (1,1,1)
            Non-seasonal ARIMA order.
        seasonal_order : tuple of (P,D,Q,s), optional
            Seasonal order. If provided, uses SARIMAX (seasonal ARIMA).
        **kwargs
            Additional keyword arguments passed to the model constructor
            (e.g., `enforce_stationarity=False`).

        Raises
        ------
        ForecastingError
            If model fitting fails.
        ValueError
            If orders contain non‑positive values.
        """
        # Validate orders
        if any(p < 0 for p in order):
            raise ValueError("ARIMA order components must be non‑negative.")
        if seasonal_order is not None and any(p < 0 for p in seasonal_order):
            raise ValueError("Seasonal order components must be non‑negative.")

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            try:
                if seasonal_order is not None:
                    logger.info(
                        "Fitting SARIMAX order=%s seasonal_order=%s.",
                        order,
                        seasonal_order,
                    )
                    self._model = SARIMAX(
                        self._series,
                        order=order,
                        seasonal_order=seasonal_order,
                        **kwargs,
                    )
                else:
                    logger.info("Fitting ARIMA order=%s.", order)
                    self._model = ARIMA(self._series, order=order, **kwargs)
                self._results = self._model.fit(disp=False)
                logger.info("Model fitting completed successfully.")
            except Exception as exc:
                raise ForecastingError(f"Model fitting failed: {exc}") from exc

    @property
    def fitted(self) -> bool:
        """Check if a model has been fitted."""
        return self._results is not None

    # --------------------------------------------------------------------------
    # Forecasting Methods
    # --------------------------------------------------------------------------

    def forecast_daily(self, steps: int = 30) -> pd.Series:
        """
        Generate a daily forecast for the specified number of steps.

        Parameters
        ----------
        steps : int, default 30
            Number of daily steps to forecast.

        Returns
        -------
        pd.Series
            Forecasted values with a DatetimeIndex.

        Raises
        ------
        ForecastingError
            If model not fitted or forecasting fails.
        ValueError
            If steps is not positive.
        """
        if not isinstance(steps, int) or steps <= 0:
            raise ValueError("`steps` must be a positive integer.")
        if not self.fitted:
            raise ForecastingError("Model not fitted yet. Call `fit()` first.")

        try:
            forecast_result = self._results.get_forecast(steps=steps)
            forecast_mean = forecast_result.predicted_mean
            # Set frequency to match original series
            forecast_mean.index.freq = self._freq
            logger.info("Daily forecast generated for %d steps.", steps)
            return forecast_mean
        except Exception as exc:
            raise ForecastingError(f"Daily forecasting failed: {exc}") from exc

    def forecast_weekly(self, weeks: int = 4) -> pd.Series:
        """
        Generate a weekly projection by forecasting daily and resampling.

        Parameters
        ----------
        weeks : int, default 4
            Number of weeks to project.

        Returns
        -------
        pd.Series
            Weekly forecast values (indexed by week start dates).

        Raises
        ------
        ForecastingError
            If model not fitted or forecasting fails.
        ValueError
            If weeks is not positive.
        """
        if not isinstance(weeks, int) or weeks <= 0:
            raise ValueError("`weeks` must be a positive integer.")
        if not self.fitted:
            raise ForecastingError("Model not fitted yet. Call `fit()` first.")

        try:
            daily_steps = weeks * 7  # approximate 7 days per week
            daily_forecast = self.forecast_daily(steps=daily_steps)
            # Resample to weekly (Monday start) summing volume
            weekly_forecast = daily_forecast.resample("W-MON").sum()
            weekly_forecast.index.name = "week_start"
            logger.info("Weekly projection generated for %d weeks.", weeks)
            return weekly_forecast
        except Exception as exc:
            raise ForecastingError(f"Weekly forecasting failed: {exc}") from exc

    def get_historical_comparison(
        self, steps: int = 10
    ) -> pd.DataFrame:
        """
        Compare actual values with forecasted values for the last `steps` days.

        The model is refitted on data excluding the last `steps` observations,
        then forecasts are generated and compared with the held-out actuals.

        Parameters
        ----------
        steps : int, default 10
            Number of last observations to use for comparison.

        Returns
        -------
        pd.DataFrame
            DataFrame with columns ``['actual', 'forecast']`` and a DatetimeIndex.

        Raises
        ------
        ForecastingError
            If model is not fitted or comparison fails.
        ValueError
            If steps is not positive or exceeds series length.
        """
        if not isinstance(steps, int) or steps <= 0:
            raise ValueError("`steps` must be a positive integer.")
        if not self.fitted:
            raise ForecastingError(
                "Model not fitted yet. Call `fit()` first."
            )
        if steps >= len(self._series):
            raise ValueError(
                f"`steps` ({steps}) must be less than series length ({len(self._series)})."
            )

        try:
            # Split data: training = all but last `steps`
            train = self._series.iloc[:-steps]
            test = self._series.iloc[-steps:]

            # Refit model on training data (same parameters)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ConvergenceWarning)
                if isinstance(self._model, SARIMAX):
                    refit_model = SARIMAX(train, order=self._model.order,
                                          seasonal_order=self._model.seasonal_order)
                else:
                    refit_model = ARIMA(train, order=self._model.order)
                refit_results = refit_model.fit(disp=False)

            # Forecast exactly `steps` ahead
            forecast_result = refit_results.get_forecast(steps=steps)
            forecast_values = forecast_result.predicted_mean
            forecast_values.index.freq = self._freq

            comparison = pd.DataFrame(
                {"actual": test.values, "forecast": forecast_values.values},
                index=test.index,
            )
            logger.info(
                "Historical comparison generated for %d steps.", steps
            )
            return comparison
        except Exception as exc:
            raise ForecastingError(
                f"Historical comparison failed: {exc}"
            ) from exc

    # --------------------------------------------------------------------------
    # Plotting
    # --------------------------------------------------------------------------

    def plot_historical_comparison(
        self, steps: int = 10, figsize: Tuple[int, int] = _PLOT_FIGSIZE
    ) -> matplotlib.figure.Figure:
        """
        Plot actual vs. forecast for the last `steps` observations.

        Parameters
        ----------
        steps : int, default 10
            Number of steps to compare.
        figsize : tuple of int, default (12, 6)
            Figure size in inches.

        Returns
        -------
        matplotlib.figure.Figure
            The generated figure object.

        Raises
        ------
        ForecastingError
            If comparison fails.
        """
        comparison = self.get_historical_comparison(steps=steps)
        fig, ax = plt.subplots(figsize=figsize)
        ax.plot(comparison.index, comparison["actual"], label="Actual", marker="o")
        ax.plot(
            comparison.index,
            comparison["forecast"],
            label="Forecast",
            linestyle="--",
            marker="x",
        )
        ax.set_title(f"Historical Comparison – Last {steps} Observations")
        ax.set_xlabel("Date")
        ax.set_ylabel("Transaction Volume")
        ax.legend()
        ax.grid(True)
        fig.autofmt_xdate()
        logger.info("Historical comparison plot generated.")
        return fig

    # --------------------------------------------------------------------------
    # Utility
    # --------------------------------------------------------------------------

    def summary(self) -> str:
        """Return model summary string if fitted, else a warning."""
        if self.fitted:
            return str(self._results.summary())
        return "Model has not been fitted yet."