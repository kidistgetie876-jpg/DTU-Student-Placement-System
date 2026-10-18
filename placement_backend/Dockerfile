FROM php:8.2-apache

# Enable Apache mod_rewrite for API routing
RUN a2enmod rewrite

# Install MySQL extension
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Render routes traffic to port 10000 by default.
RUN sed -i 's/Listen 80/Listen 10000/' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:10000>/' /etc/apache2/sites-available/000-default.conf

# Copy backend files into Apache web root
COPY . /var/www/html/

# Set working directory
WORKDIR /var/www/html

EXPOSE 10000