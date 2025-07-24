# scripts/labreevaltorequester.py

import sys
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# --- CONFIGURAÇÕES DO SERVIDOR SMTP ---
SMTP_SERVER = 'mail.mercotech.com.br'
SMTP_PORT = 587
SMTP_USER = 'status@mercotech.com.br'
SMTP_PASSWORD = 'ukr>d@fZD*I#D$y5Ji*@'

def send_final_notification(recipient_email, ossm_id):
    """Prepara a notificação final para o solicitante."""
    subject = f"Solicitação Concluída: OS #{ossm_id}"
    
    # Mensagem específica para esta etapa do fluxo
    message_body = (
        f"Olá,<br><br>"
        f"Sua solicitação de serviço, agora identificada como <b>OS #{ossm_id}</b>, foi concluída com sucesso.<br><br>"
        "O serviço foi executado pela equipe de manutenção e o item foi posteriormente reavaliado e liberado pelo laboratório.<br><br>"
        "Agradecemos a sua colaboração."
    )
    
    send_email(recipient_email, subject, message_body)

def send_email(recipient, subject, message_body):
    """Envia o e-mail usando o template HTML."""
    try:
        # Assumindo que você tem um template padrão para os e-mails
        with open('email_template.html', 'r', encoding='utf-8') as f:
            html_template = f.read()

        html_content = html_template.replace('{ASSUNTO}', subject).replace('{MENSAGEM}', message_body)

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = SMTP_USER
        msg['To'] = recipient

        msg.attach(MIMEText(html_content, 'html'))
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            # sendmail precisa de uma lista de destinatários
            server.sendmail(SMTP_USER, recipient.split(','), msg.as_string())
            print(f"E-mail de finalização (via Lab) enviado com sucesso para {recipient}")

    except Exception as e:
        print(f"Erro ao enviar e-mail: {e}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python labreevaltorequester.py <ossm_id> <recipient_email>", file=sys.stderr)
        sys.exit(1)
    
    ossm_id_arg = sys.argv[1]
    email_arg = sys.argv[2]
    send_final_notification(email_arg, ossm_id_arg)