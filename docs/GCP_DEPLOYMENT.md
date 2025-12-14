# Deploying NxScraper to Google Cloud VM

This guide assumes you have already:
1.  Provisioned a Google Cloud VM (e.g., e2-medium or larger recommended).
2.  SSH'd into the VM.
3.  Installed **Docker** and **Docker Compose**.
4.  Cloned the repository: `git clone <your-repo-url>` and navigated into it.

## Step 1: Configure Environment Variables

The application requires environment variables to run. You need to create a `.env` file based on the example.

1.  Copy the example file:
    ```bash
    cp .env.example .env
    ```

2.  Edit the `.env` file:
    ```bash
    nano .env
    ```

3.  **Critical Variables to Set**:
    *   `NODE_ENV=production`
    *   `API_PORT=3000`
    *   `REDIS_URL=redis://redis:6379` (This matches the service name in `docker.prod.yml`)
    *   `API_KEYS=...` (Set your initial master API key)
    *   **AI Keys**: Add your `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.

## Step 2: Build and Start Production Services

We will use the production Docker Compose file (`docker.prod.yml`) to build and start the services.

1.  **Build and Start in Detached Mode**:
    ```bash
    docker compose -f docker.prod.yml up -d --build
    ```
    *   `-f docker.prod.yml`: Specifies the production configuration.
    *   `-d`: Runs containers in the background.
    *   `--build`: Forces a rebuild of the images to ensure you have the latest code.

2.  **Verify Services are Running**:
    ```bash
    docker compose -f docker.prod.yml ps
    ```
    You should see `scrapex-api`, `scrapex-redis`, and `nxscraper-worker` (multiple instances) with status `Up`.

3.  **Check Logs** (if needed):
    ```bash
    # View all logs
    docker compose -f docker.prod.yml logs -f

    # View specific service logs (e.g., api)
    docker compose -f docker.prod.yml logs -f api
    ```

## Step 3: Configure Firewall (GCP)

To access the API from the internet, you need to allow traffic on port 3000.

1.  Go to **Google Cloud Console** > **VPC network** > **Firewall**.
2.  Click **Create Firewall Rule**.
3.  **Name**: `allow-scrapex-api`
4.  **Targets**: `All instances in the network` (or specify your VM tag).
5.  **Source IPv4 ranges**: `0.0.0.0/0` (allows access from anywhere).
6.  **Protocols and ports**: Check `tcp` and enter `3000`.
7.  Click **Create**.

Now you can access via: `http://<YOUR_VM_EXTERNAL_IP>:3000/health`

## Step 4: (Optional) Set up Nginx & SSL

For a production grade setup, do not expose port 3000 directly. Use Nginx as a reverse proxy with HTTPS.

1.  **Install Nginx**:
    ```bash
    sudo apt update
    sudo apt install nginx -y
    ```

2.  **Configure Nginx**:
    Create a config file: `sudo nano /etc/nginx/sites-available/scrapex`
    ```nginx
    server {
        server_name your-domain.com; # Replace with your domain or IP

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  **Enable Site**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/scrapex /etc/nginx/sites-enabled/
    sudo rm /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl restart nginx
    ```

4.  **Add SSL (Certbot)**:
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    sudo certbot --nginx -d your-domain.com
    ```
