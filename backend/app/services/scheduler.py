from datetime import datetime, timezone
from sqlmodel import Session, select
from app.models import User
from app.database import engine
from app.services.telegram import send_telegram_message

def check_subscriptions_and_notify():
    """Revisa los usuarios con suscripción y envía avisos según los días faltantes."""
    with Session(engine) as session:
        users = session.exec(select(User).where(User.subscription_expires_at != None)).all()
        now = datetime.now(timezone.utc)

        for user in users:
            if not user.telegram_chat_id:
                continue

            exp_date = user.subscription_expires_at
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)

            delta = exp_date - now
            days_left = delta.days

            # Alerta 3 días antes del vencimiento
            if days_left == 3:
                msg = f"⚠️ <b>¡Hola {user.username}!</b>\n\nTu suscripción vencerá en <b>3 días</b>. Por favor realiza tu renovación para continuar disfrutando del servicio."
                send_telegram_message(user.telegram_chat_id, msg)

            # Alerta el día de vencimiento o posterior
            elif days_left <= 0:
                msg = f"🚫 <b>¡Hola {user.username}!</b>\n\nTu suscripción ha <b>vencido</b>. El acceso al sistema ha sido suspendido. Contacta al administrador para renovar."
                send_telegram_message(user.telegram_chat_id, msg)