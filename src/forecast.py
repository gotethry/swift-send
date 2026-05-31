"""
src/forecast.py

Enhanced forecasting module for transaction volume.
Provides ARIMA-based daily forecasts, weekly projections, and historical comparisons,
with robust error handling, type safety, comprehensive logging, and input validation.
"""

import logging
import warnings
from typing import Any, Dict, Final, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from statsmodels.tools.sm_exceptions import ConvergenceWarning
from statsmodels.tsa.arima.model import ARIMA as ARIMAModel

logger = logging.getLogger(__name__)

# Constants
DEFAULT_ORDER: Final[Tuple[int, int, int]] = (1, 1, 1)
DEFAULT_STEPS: Final[int] = 30
DEFAULT_ALPHA: Final[float] = 0.05
MAX_STEPS: Final[int] = 365
MIN_OBSERVATIONS: Final[int] = 10


def _validate_series(series: pd.Series) -> pd.Series:
    """Validate and clean forecast input series.

    Args:
        series: Input time series.

    Returns:
        Cleaned series sorted and with DatetimeIndex.

    Raises:
        TypeError: If index is not DatetimeIndex.
        ValueError: If series is empty, contains non-numeric data, or has too few points.
    """
    if not isinstance(series.index, pd.DatetimeIndex):
        raise TypeError("Input series must have a DatetimeIndex.")
    if series.empty:
        raise ValueError("Input series cannot be empty.")
    if not np.issubdtype(series.dtype, np.number):
        raise ValueError("Input series must contain numeric data.")
    series = series.sort_index()
    if len(series) < MIN_OBSERVATIONS:
        raise ValueError(
            f"Series must have at least {MIN_OBSERVATIONS} observations; got {len(series)}."
        )
    return series


def _validate_steps(steps: int) -> None:
    """Validate steps parameter.

    Args:
        steps: Number of forecast steps.

    Raises:
        ValueError: If steps is not an integer between 1 and MAX_STEPS.
    """
    if not isinstance(steps, int) or steps < 1 or steps > MAX_STEPS:
        raise ValueError(f"steps must be an integer between 1 and {MAX_STEPS}; got {steps}.")


def _validate_alpha(alpha: float) -> None:
    """Validate alpha parameter.

    Args:
        alpha: Significance level.

    Raises:
        ValueError: If alpha is not a float in (0, 1).
    """
    if not isinstance(alpha, (int, float)) or not (0 < alpha < 1):
        raise ValueError("alpha must be a float in (0, 1).")


def _validate_aggregation(agg: str) -> None:
    """Validate aggregation method.

    Args:
        agg: Aggregation type.

    Raises:
        ValueError: If aggregation is not 'sum' or 'mean'.
    """
    if agg not in ("sum", "mean"):
        raise ValueError("aggregation must be 'sum' or 'mean'.")


class ARIMAForecaster:
    """ARIMA-based forecaster for transaction volumes.

    Fits an ARIMA model on historical data, generates daily forecasts with
    confidence intervals, supports weekly aggregation and historical comparisons.

    Args:
        order: The (p, d, q) order of the ARIMA model. Default (1,1,1).

    Attributes:
        model_fit_: Fitted ARIMA model after calling ``fit()``.
        history_: Fitted historical data (sorted, DatetimeIndex).
        order_: Order used for the ARIMA model.
        freq_unit_: Inferred frequency of the time series.
    """

    def __init__(self, order: Tuple[int, int, int] = DEFAULT_ORDER) -> None:
        if not (len(order) == 3 and all(isinstance(x, int) and x >= 0 for x in order)):
            raise ValueError("order must be a tuple of three non-negative integers.")
        self.order: Tuple[int, int, int] = order
        self.model_fit_: Optional[ARIMAModel] = None
        self.history_: Optional[pd.Series] = None
        self.freq_unit_: str = "D"

    def fit(self, historical: pd.Series) -> "ARIMAForecaster":
        """Fit the ARIMA model on historical transaction volume data.

        Args:
            historical: Time series with DatetimeIndex and numeric volumes.
                        Missing values are forward-filled.

        Returns:
            Self for method chaining.

        Raises:
            TypeError: If index is not DatetimeIndex.
            ValueError: If series is empty, non-numeric, or too short.
            RuntimeError: If model fitting fails.
        """
        historical = _validate_series(historical)

        # Handle missing values
        if historical.isna().any():
            logger.warning("Missing values detected; forward-filling before fitting.")
            historical = historical.ffill()

        # Infer frequency and create continuous index
        approx_freq = pd.infer_freq(historical.index)
        if approx_freq is None:
            logger.info("Could not infer frequency; assuming daily ('D').")
            approx_freq = "D"
        self.freq_unit_ = approx_freq[0] if approx_freq else "D"
        historical = historical.asfreq(self.freq_unit_)

        # Fit ARIMA model
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", ConvergenceWarning)
                model = ARIMAModel(historical, order=self.order)
                self.model_fit_ = model.fit(method_kwargs={"disp": False})
        except Exception as e:
            raise RuntimeError(f"ARIMA model fitting failed: {e}") from e

        self.history_ = historical.copy()
        logger.info(
            "ARIMA%s model fitted on %d observations with frequency '%s'.",
            self.order,
            len(historical),
            self.freq_unit_,
        )
        logger.debug("Model summary: AIC=%.2f, BIC=%.2f", self.model_fit_.aic, self.model_fit_.bic)
        return self

    def forecast_daily(
        self, steps: int = DEFAULT_STEPS, alpha: float = DEFAULT_ALPHA
    ) -> pd.DataFrame:
        """Generate daily forecasts with confidence intervals.

        Args:
            steps: Number of days to forecast ahead (1 to MAX_STEPS). Default 30.
            alpha: Significance level for confidence intervals (0 < alpha < 1).
                   E.g., 0.05 => 95% CI.

        Returns:
            DataFrame with columns ``forecast``, ``lower_bound``, ``upper_bound``
            and a DatetimeIndex starting after the last historical date.
            Forecasted volumes are clamped to non-negative values.

        Raises:
            RuntimeError: If model has not been fitted.
            ValueError: If steps or alpha are out of valid range.
        """
        if self.model_fit_ is None:
            raise RuntimeError("Model must be fitted before forecasting. Call .fit() first.")
        _validate_steps(steps)
        _validate_alpha(alpha)

        try:
            forecast_result = self.model_fit_.get_forecast(steps=steps, alpha=alpha)
        except Exception as e:
            raise RuntimeError(f"Forecast generation failed: {e}") from e

        last_date = pd.Timestamp(self.history_.index[-1])
        forecast_index = pd.date_range(
            start=last_date + pd.Timedelta(days=1),
            periods=steps,
            freq="D",
        )

        forecast_values = forecast_result.predicted_mean
        conf_int = forecast_result.conf_int()
        lower = conf_int.iloc[:, 0]
        upper = conf_int.iloc[:, 1]

        forecast_df = pd.DataFrame(
            {
                "forecast": np.maximum(forecast_values, 0.0),
                "lower_bound": np.maximum(lower, 0.0),
                "upper_bound": np.maximum(upper, 0.0),
            },
            index=forecast_index[:steps],
        )
        forecast_df.index.name = "date"
        logger.info("Daily forecast generated for %d steps (alpha=%.3f).", steps, alpha)
        return forecast_df

    def weekly_aggregation(
        self, daily_forecast: pd.DataFrame, aggregation: str = "sum"
    ) -> pd.DataFrame:
        """Aggregate daily forecast data to weekly buckets.

        Args:
            daily_forecast: DataFrame with DatetimeIndex and numeric columns
                            (e.g., forecast, lower_bound, upper_bound).
            aggregation: Aggregation method, either ``"sum"`` or ``"mean"``.

        Returns:
            Weekly aggregated DataFrame indexed by week start (Monday).
            Columns are the same as input (aggregated).

        Raises:
            TypeError: If daily_forecast index is not DatetimeIndex.
            ValueError: If aggregation method is invalid or input is empty.
        """
        if not isinstance(daily_forecast.index, pd.DatetimeIndex):
            raise TypeError("daily_forecast must have a DatetimeIndex.")
        if daily_forecast.empty:
            raise ValueError("daily_forecast cannot be empty.")
        _validate_aggregation(aggregation)

        # Use Monday as week start
        weekly = daily_forecast.resample("W-MON").agg(aggregation)
        weekly.index.name = "week_start"
        logger.info(
            "Daily forecast aggregated to weekly (%s) – %d weeks.",
            aggregation,
            len(weekly),
        )
        return weekly

    def weekly_projection(
        self, steps: int = 4, alpha: float = DEFAULT_ALPHA, aggregation: str = "sum"
    ) -> pd.DataFrame:
        """Generate weekly projections from daily forecasts.

        Combines daily forecasting and weekly aggregation into one step.

        Args:
            steps: Number of weeks to project ahead (each week = 7 days,
                   total days = steps*7, capped by MAX_STEPS). Default 4.
            alpha: Significance level for confidence intervals (0 < alpha < 1).
            aggregation: Aggregation method, either ``"sum"`` or ``"mean"``.

        Returns:
            Weekly aggregated forecast DataFrame.

        Raises:
            RuntimeError: If model has not been fitted.
            ValueError: If steps, alpha, or aggregation are invalid.
        """
        if self.model_fit_ is None:
            raise RuntimeError("Model must be fitted before projecting. Call .fit() first.")
        if not isinstance(steps, int) or steps < 1:
            raise ValueError(f"steps must be a positive integer; got {steps}.")
        _validate_alpha(alpha)
        _validate_aggregation(aggregation)

        # Total days needed for weekly projection
        total_days = steps * 7
        if total_days > MAX_STEPS:
            logger.warning(
                "Requested %d weeks (%d days) exceeds MAX_STEPS=%d. Capping to %d days.",
                steps,
                total_days,
                MAX_STEPS,
                MAX_STEPS,
            )
            total_days = MAX_STEPS
            steps = total_days // 7

        daily_forecast = self.forecast_daily(steps=total_days, alpha=alpha)
        weekly = self.weekly_aggregation(daily_forecast, aggregation=aggregation)

        # Trim to exactly the requested number of weeks (if not capped)
        weekly = weekly.iloc[:steps]
        logger.info(
            "Weekly projection generated for %d weeks (alpha=%.3f, aggregation='%s').",
            steps,
            alpha,
            aggregation,
        )
        return weekly

    def historical_comparison(
        self,
        comparison_period: Optional[Tuple[str, str]] = None,
    ) -> pd.DataFrame:
        """Compare recent actual volumes with historical statistics.

        Produces a DataFrame with actual volumes for a given period, along with
        historical mean and standard deviation computed over all training data.

        Args:
            comparison_period: Tuple of (start_date, end_date) strings.
                               If None, uses the last 30 days of history.

        Returns:
            DataFrame indexed by date with columns:
            - actual: actual volume
            - historical_mean: mean over the full history (excluding current date)
            - historical_std: std over the full history (excluding current date)

        Raises:
            RuntimeError: If model has not been fitted.
            ValueError: If history is empty or comparison period is invalid.
        """
        if self.history_ is None:
            raise RuntimeError("Model must be fitted before comparison. Call .fit() first.")

        series = self.history_
        if comparison_period is not None:
            start, end = comparison_period
            try:
                start_ts = pd.Timestamp(start)
                end_ts = pd.Timestamp(end)
                if start_ts > end_ts:
                    raise ValueError("start_date must be before end_date.")
                mask = (series.index >= start_ts) & (series.index <= end_ts)
                if not mask.any():
                    raise ValueError("No data in the specified comparison period.")
                comparison_data = series[mask]
            except (ValueError, TypeError) as e:
                raise ValueError(f"Invalid comparison period: {e}") from e
        else:
            # Default: last 30 days
            comparison_data = series.tail(30)
            if comparison_data.empty:
                raise ValueError("No data available for last 30 days.")

        # Compute historical stats excluding current date
        def _exclude_stats(date: pd.Timestamp) -> Tuple[float, float]:
            mask = series.index != date
            sub = series[mask]
            return float(sub.mean()), float(sub.std(ddof=0))

        results = []
        for date, actual in comparison_data.items():
            hist_mean, hist_std = _exclude_stats(date)
            results.append(
                {
                    "actual": float(actual),
                    "historical_mean": hist_mean,
                    "historical_std": hist_std,
                }
            )

        result_df = pd.DataFrame(
            results, index=comparison_data.index
        )
        result_df.index.name = "date"
        logger.info(
            "Historical comparison generated for %d dates.",
            len(result_df),
        )
        return result_df

    def get_forecast_summary(
        self, steps: int = DEFAULT_STEPS, alpha: float = DEFAULT_ALPHA
    ) -> Dict[str, Any]:
        """Return a summary dictionary of daily forecast statistics.

        Includes total, min, max, mean, median, and confidence intervals.

        Args:
            steps: Number of days to forecast.
            alpha: Confidence level parameter.

        Returns:
            Dictionary with forecast summary keys.

        Raises:
            RuntimeError: If model not fitted.
            ValueError: If steps or alpha invalid.
        """
        daily = self.forecast_daily(steps, alpha)
        forecast_col = daily["forecast"]
        lower = daily["lower_bound"]
        upper = daily["upper_bound"]

        summary: Dict[str, Any] = {
            "total_forecast": round(float(forecast_col.sum()), 2),
            "min_daily": round(float(forecast_col.min()), 2),
            "max_daily": round(float(forecast_col.max()), 2),
            "mean_daily": round(float(forecast_col.mean()), 2),
            "median_daily": round(float(forecast_col.median()), 2),
            "avg_confidence_interval_width": round(
                float((upper - lower).mean()), 2
            ),
            "forecast_dates": {
                "start": str(daily.index[0].date()),
                "end": str(daily.index[-1].date()),
            },
        }
        logger.debug("Forecast summary computed.")
        return summary